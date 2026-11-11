import { beginTransaction } from '@data-stores/psql'
import { compensatePostRevision } from '@services/post-revisions'
import sql from 'sql-template-strings'
import { recordPostPublicationChange } from '@services/post-publication'
import {
  admitAutomatedPostModeration,
  ensureCurrentPostModerationVersion,
  restorePostClearanceStatus,
  type ClearanceStatus,
} from '@services/post-clearance'
import { assertPostImagePlacementCapacity, syncPostImagePlacements } from './image-placements.mts'
import { repairFailedImageDeliveryMutation } from '@services/media-delivery-safety'
import type { PostImageRollback } from './images-rollback-types.mts'
import { postImagesEqual } from './images-rollback-state.mts'
import { runSequentially } from '@modules/utils/run-sequentially'
import { IMAGE_PLACEMENT_LIMIT_REACHED } from '@modules/on-error/error-codes'
import { isHttpError } from 'http-errors'

export type { PostImageRollback } from './images-rollback-types.mts'

export async function rollbackPostImages(
  postId: string,
  rollback: PostImageRollback,
  options?: { onImageLockQuery?: () => void },
): Promise<boolean> {
  const deliveryImageIds = [
    ...new Set([...rollback.currentImages, ...rollback.images].map(image => image.image_id)),
  ].toSorted()
  await using query = await beginTransaction()
  let ensuredCurrentVersion = false
  async function keepCurrentModerationVersion(): Promise<false> {
    await ensureCurrentPostModerationVersion(postId, { query })
    ensuredCurrentVersion = true
    return false
  }
  async function rollbackImagesInTransaction() {
    const imageIds = deliveryImageIds
    let rollbackImagesAvailable = true
    if (imageIds.length > 0) {
      const imageLock = query<{
        id: string
      }>(sql`/* rollbackPostImages:lockImages */
        SELECT id
        FROM images
        WHERE id = ANY(${imageIds}::uuid[])
          AND upload_completed_at IS NOT NULL
          AND deleted_at IS NULL
          AND quarantine_pending_at IS NULL
        ORDER BY id
      `)
      options?.onImageLockQuery?.()
      const { rows: availableImages } = await imageLock
      rollbackImagesAvailable = availableImages.length === imageIds.length
    }
    const { rows: postRows } = await query<{
      llm_moderation_content_sha256: Buffer | null
      clearance_version: string
    }>(sql`/* rollbackPostImages */
      SELECT llm_moderation_content_sha256,
        clearance_version
      FROM posts
      WHERE id = ${postId}
    `)
    const post = postRows[0]
    if (
      !post ||
      !rollbackImagesAvailable ||
      !bufferEquals(
        post.llm_moderation_content_sha256,
        rollback.currentLlmModerationContentSha256,
      ) ||
      post.clearance_version !== rollback.currentClearanceVersion
    ) {
      return post ? keepCurrentModerationVersion() : false
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
      return keepCurrentModerationVersion()
    }
    try {
      await assertPostImagePlacementCapacity(
        postId,
        rollback.images.map(image => image.image_id),
        query,
      )
    } catch (err) {
      if (!isHttpError(err) || err.status !== 409 || err['code'] !== IMAGE_PLACEMENT_LIMIT_REACHED)
        throw err
      return keepCurrentModerationVersion()
    }
    const { rows: restored } = await query(sql`/* rollbackPostImages:restoreOwner */
      UPDATE posts
      SET llm_moderation_content_sha256 = ${rollback.llmModerationContentSha256}
      WHERE id = ${postId}
        AND llm_moderation_content_sha256 = ${rollback.currentLlmModerationContentSha256}
        AND clearance_version IS NOT DISTINCT FROM ${rollback.currentClearanceVersion}
      RETURNING id`)
    if (restored.length !== 1) return keepCurrentModerationVersion()
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
    await runSequentially([
      () =>
        syncPostImagePlacements(
          postId,
          rollback.images.map(image => image.image_id),
          query,
          { capacityChecked: true },
        ),
      () => compensatePostRevision(postId, rollback.revisionId, { query }),
    ])
    if (rollback.currentClearanceVersion !== rollback.clearanceVersion) {
      if (rollback.currentClearanceVersion === null) {
        throw new Error(`Post image rollback is missing the compensated change for post ${postId}`)
      }
      await restorePostClearanceStatus(
        postId,
        getRollbackClearanceStatus(rollback),
        rollback.clearanceChangedById,
        { query },
        {
          reason: 'image_update_enqueue_rollback',
          compensates_clearance_version: rollback.currentClearanceVersion,
          restores_clearance_version: rollback.clearanceVersion,
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
  const result = await rollbackImagesInTransaction()
  await query.commit()
  if (ensuredCurrentVersion) await admitAutomatedPostModeration(postId)
  if (result) {
    await repairFailedImageDeliveryMutation({ postIds: [postId], imageIds: deliveryImageIds })
  }
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
