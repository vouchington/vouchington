import { beginTransaction } from '@data-stores/psql'
import type { TransactionQuery } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import { lockPostPublication, recordPostPublicationChange } from '@services/post-publication'
import { setPostClearanceStatus, type ClearanceStatus } from '@services/post-clearance'

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
  currentOpenaiModerationContentSha256: Buffer
  currentLlmModerationContentSha256: Buffer
  openaiModerationContentSha256: Buffer
  llmModerationContentSha256: Buffer
  changedById: string
  currentLatestClearanceChangeId: string | null
  latestClearanceChangeId: string | null
  approvedAt: Date | null
  rejectedAt: Date | null
  inReviewAt: Date | null
  spamDetectionFlagged: boolean | null
  spamDetectionCreatedAt: Date | null
  spamDetectionScore: number | null
  spamDetectionResults: unknown | null
  openaiModerationFlagged: boolean | null
  openaiModerationCreatedAt: Date | null
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
    if (imageIds.length > 0) {
      await query(sql`/* rollbackPostImages:lockImages */
        SELECT id
        FROM images
        WHERE id = ANY(${imageIds}::uuid[])
        ORDER BY id
        FOR SHARE
      `)
    }
    await lockPostPublication(query, postId)
    const { rows: postRows } = await query<{
      openai_omni_moderation_content_sha256: Buffer | null
      llm_moderation_content_sha256: Buffer | null
      latest_clearance_change_id: string | null
    }>(sql`/* rollbackPostImages */
      SELECT openai_omni_moderation_content_sha256,
        llm_moderation_content_sha256,
        latest_clearance_change_id
      FROM posts
      WHERE id = ${postId}
      FOR UPDATE
    `)
    const post = postRows[0]
    if (
      !post ||
      !bufferEquals(
        post.openai_omni_moderation_content_sha256,
        rollback.currentOpenaiModerationContentSha256,
      ) ||
      !bufferEquals(
        post.llm_moderation_content_sha256,
        rollback.currentLlmModerationContentSha256,
      ) ||
      post.latest_clearance_change_id !== rollback.currentLatestClearanceChangeId
    ) {
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
    if (!postImagesEqual(currentImages, rollback.currentImages)) return false

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
      SET openai_omni_moderation_content_sha256 = ${rollback.openaiModerationContentSha256},
          llm_moderation_content_sha256 = ${rollback.llmModerationContentSha256},
          spam_detection_flagged = ${rollback.spamDetectionFlagged},
          spam_detection_created_at = ${rollback.spamDetectionCreatedAt},
          spam_detection_score = ${rollback.spamDetectionScore},
          spam_detection_results = ${
            rollback.spamDetectionResults == null
              ? null
              : JSON.stringify(rollback.spamDetectionResults)
          }::jsonb,
          openai_omni_moderation_flagged = ${rollback.openaiModerationFlagged},
          openai_omni_moderation_created_at = ${rollback.openaiModerationCreatedAt},
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ${postId}
    `)
    await query(sql`/* rollbackPostImages */
      DELETE FROM post_revisions
      WHERE id = ${rollback.revisionId}
        AND post_id = ${postId}
    `)
    if (rollback.currentLatestClearanceChangeId !== rollback.latestClearanceChangeId) {
      await setPostClearanceStatus(
        postId,
        getRollbackClearanceStatus(rollback),
        rollback.changedById,
        { query },
        {
          reason: 'image_update_enqueue_rollback',
          compensates_change_id: rollback.currentLatestClearanceChangeId,
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
