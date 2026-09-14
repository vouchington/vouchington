import { beginTransaction } from '@data-stores/psql'
import type { TransactionQuery } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import { lockPostPublication, recordPostPublicationChange } from '@services/post-publication'
import {
  ensureCurrentPostModerationVersion,
  restorePostClearanceStatus,
  type ClearanceStatus,
} from '@services/post-clearance'

export type PostImageRollback = {
  revisionId: string
  currentImages: Array<{
    image_id: string
    order_index: number
    caption: string
  }>
  images: Array<{
    image_id: string
    order_index: number
    caption: string
  }>
  currentLlmModerationContentSha256: Buffer
  llmModerationContentSha256: Buffer
  currentLatestClearanceChangeId: string | null
  latestClearanceChangeId: string | null
  approvedAt: Date | null
  rejectedAt: Date | null
  inReviewAt: Date | null
  clearanceChangedById: string | null
  clearancePublicReasonCode: string | null
  clearancePrivateNote: string | null
  clearancePlatformOverride: boolean
}

export async function rollbackPostImages(
  postId: string,
  rollback: PostImageRollback,
): Promise<boolean> {
  await using query = await beginTransaction()
  async function rollbackImagesInTransaction(query: TransactionQuery) {
    const imageIds = [
      ...new Set([...rollback.currentImages, ...rollback.images].map(image => image.image_id)),
    ].toSorted()
    let rollbackImagesAvailable = true
    if (imageIds.length > 0) {
      const { rows: availableImages } = await query<{
        id: string
      }>(sql`/* rollbackPostImages:lockImages */
        SELECT id
        FROM images
        WHERE id = ANY(${imageIds}::uuid[])
          AND upload_completed_at IS NOT NULL
          AND deleted_at IS NULL
          AND quarantine_pending_at IS NULL
        ORDER BY id
        FOR SHARE
      `)
      rollbackImagesAvailable = availableImages.length === imageIds.length
    }
    await lockPostPublication(query, postId)
    const { rows: postRows } = await query<{
      llm_moderation_content_sha256: Buffer | null
      latest_clearance_change_id: string | null
    }>(sql`/* rollbackPostImages */
      SELECT llm_moderation_content_sha256,
        latest_clearance_change_id
      FROM posts
      WHERE id = ${postId}
      FOR UPDATE
    `)
    const post = postRows[0]
    if (
      !post ||
      !rollbackImagesAvailable ||
      !bufferEquals(
        post.llm_moderation_content_sha256,
        rollback.currentLlmModerationContentSha256,
      ) ||
      post.latest_clearance_change_id !== rollback.currentLatestClearanceChangeId
    ) {
      if (post) await ensureCurrentPostModerationVersion(postId, { query })
      return false
    }

    const { rows: currentImages } = await query<PostImageRollback['currentImages'][number]>(
      sql`/* rollbackPostImages */
        SELECT image_id, order_index, caption
        FROM post_images
        WHERE post_id = ${postId}
        ORDER BY order_index
      `,
    )
    if (!postImagesEqual(currentImages, rollback.currentImages)) {
      await ensureCurrentPostModerationVersion(postId, { query })
      return false
    }

    await query(sql`/* rollbackPostImages */ DELETE FROM post_images WHERE post_id = ${postId}`)
    if (rollback.images.length > 0) {
      await query(sql`/* rollbackPostImages */
        INSERT INTO post_images (post_id, image_id, order_index, caption)
        SELECT ${postId}, image_id, order_index, caption
        FROM UNNEST(
          ${rollback.images.map(img => img.image_id)}::uuid[],
          ${rollback.images.map(img => img.order_index)}::int[],
          ${rollback.images.map(img => img.caption)}::text[]
        ) AS t(image_id, order_index, caption)
      `)
    }
    await query(sql`/* rollbackPostImages */
      UPDATE posts
      SET llm_moderation_content_sha256 = ${rollback.llmModerationContentSha256},
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ${postId}
    `)
    await query(sql`/* rollbackPostImages */
      DELETE FROM post_revisions
      WHERE id = ${rollback.revisionId}
        AND post_id = ${postId}
    `)
    if (rollback.currentLatestClearanceChangeId !== rollback.latestClearanceChangeId) {
      if (rollback.currentLatestClearanceChangeId === null) {
        throw new Error(`Post image rollback is missing the compensated change for post ${postId}`)
      }
      await restorePostClearanceStatus(
        postId,
        getRollbackClearanceStatus(rollback),
        rollback.clearanceChangedById,
        { query },
        {
          reason: 'image_update_enqueue_rollback',
          compensates_change_id: rollback.currentLatestClearanceChangeId,
          restores_change_id: rollback.latestClearanceChangeId,
        },
        {
          reasonCode: rollback.clearancePublicReasonCode ?? undefined,
          privateNote: rollback.clearancePrivateNote ?? undefined,
          platformOverride: rollback.clearancePlatformOverride,
        },
      )
    }
    await recordPostPublicationChange(query, {
      scope: { type: 'post', postId },
      reason: 'post_content_reset',
    })
    return true
  }
  const result = await rollbackImagesInTransaction(query)
  await query.commit()
  return result
}

function getRollbackClearanceStatus(rollback: PostImageRollback): ClearanceStatus {
  if (rollback.approvedAt) return 'approved'
  if (rollback.rejectedAt) return 'rejected'
  if (rollback.inReviewAt) return 'in_review'
  return 'pending'
}

function bufferEquals(actual: Buffer | null, expected: Buffer): boolean {
  return actual !== null && Buffer.compare(actual, expected) === 0
}

function postImagesEqual(
  actual: PostImageRollback['currentImages'],
  expected: PostImageRollback['currentImages'],
): boolean {
  if (actual.length !== expected.length) return false
  for (let index = 0; index < actual.length; index++) {
    const image = actual[index]!
    const expectedImage = expected[index]!
    if (
      image.image_id !== expectedImage.image_id ||
      image.order_index !== expectedImage.order_index ||
      image.caption !== expectedImage.caption
    ) {
      return false
    }
  }
  return true
}
