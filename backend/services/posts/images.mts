import { beginTransaction } from '@data-stores/psql'
import type { TransactionQuery } from '@data-stores/psql/types'
import type { PrivateUser } from '@services/users/types'
import type { Post } from './types.mts'
import { createPostModerationContent } from './content.mts'
import assert from 'http-assert'
import createHttpError from 'http-errors'
import sql from 'sql-template-strings'
import { createPostRevision } from '@services/post-revisions'
import { lockPostPublication, recordPostPublicationChange } from '@services/post-publication'
import {
  getLockedPostImagePublicationState,
  resetPostImageClearance,
} from './image-publication-state.mts'
import { syncPostImagePlacements, type PostImagePlacement } from './image-placements.mts'
import { preparePostImageDeliveryMutation } from './media-delivery.mts'
import { compensateFailedImageDeliveryMutation } from '../images/delivery-registry.mts'
import onError from '@modules/on-error'
import { assertPostImagesCanBeUpdated } from './images-update-authorization.mts'
import { completePostImageUpdate } from './complete-post-image-update.mts'
export { getPostImages } from './post-image-read.mts'

export type PostImageInput = {
  image_id: string
  order_index: number
  caption?: string
}
type PostImage = PostImagePlacement
type PersistedPostImage = Pick<PostImage, 'image_id' | 'order_index' | 'caption'>
export async function setPostImages(
  currentUser: PrivateUser,
  post: Post,
  images: PostImageInput[],
): Promise<PostImage[]> {
  await assertPostImagesCanBeUpdated(currentUser, post, images)
  let deliveryPrepared = false
  async function savePostImagesInTransaction() {
    await using query = await beginTransaction()
    async function saveImageRows(query: TransactionQuery) {
      if (images.length > 0) {
        const imageIds = images.map(img => img.image_id)
        const { rows: imageRows } = await query<{ id: string }>(sql`/* setPostImages */
        SELECT id
        FROM images
        WHERE id = ANY(${imageIds}::uuid[])
          AND upload_completed_at IS NOT NULL
          AND deleted_at IS NULL
          AND quarantine_pending_at IS NULL
        FOR SHARE
      `)
        assert(imageRows.length === imageIds.length, 400, 'Image not found or not complete')
      }
      deliveryPrepared = true
      await preparePostImageDeliveryMutation(query, {
        postId: post.id,
        imageIds: images.map(image => image.image_id),
        retainImageIds: images.map(image => image.image_id),
      })
      await lockPostPublication(query, post.id)
      const postState = await getLockedPostImagePublicationState(query, post.id)
      const {
        title,
        markdown,
        structured_data,
        ai_summary_markdown,
        llm_moderation_content_sha256,
        latest_clearance_change_id,
        approved_at,
        rejected_at,
        in_review_at,
        clearance_changed_by_id,
        clearance_public_reason_code,
        clearance_private_note,
        clearance_platform_override,
      } = postState
      const { rows: previousImages } = await query<PersistedPostImage>(sql`/* setPostImages */
      SELECT image_id, order_index, caption
      FROM post_images
      WHERE post_id = ${post.id}
      ORDER BY order_index
    `)

      const { content_sha256: moderationSha } = createPostModerationContent({
        title,
        markdown,
        images,
        structured_data,
        ai_summary_markdown: ai_summary_markdown ?? undefined,
      })

      await query(sql`/* setPostImages */ DELETE FROM post_images WHERE post_id = ${post.id}`)

      if (images.length > 0) {
        await query(sql`/* setPostImages */
        INSERT INTO post_images (post_id, image_id, order_index, caption)
        SELECT ${post.id}, image_id, order_index, caption
        FROM UNNEST(
          ${images.map(img => img.image_id)}::uuid[],
          ${images.map(img => img.order_index)}::int[],
          ${images.map(img => img.caption ?? '')}::text[]
        ) AS t(image_id, order_index, caption)
      `)
      }
      await syncPostImagePlacements(
        post.id,
        images.map(image => image.image_id),
        { query },
      )

      await query(sql`/* setPostImages */
      UPDATE posts
      SET llm_moderation_content_sha256 = ${moderationSha},
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ${post.id}
    `)

      const currentLatestClearanceChangeId = await resetPostImageClearance(
        query,
        post.id,
        currentUser.id,
      )

      const { rows } = await query<PostImage>(sql`/* setPostImages */
      SELECT post_image.image_id, post_image.order_index, post_image.caption,
        placement.id AS placement_id, placement.revision AS placement_revision
      FROM post_images post_image
      JOIN image_placements image_placement
        ON image_placement.post_id = post_image.post_id
        AND image_placement.image_id = post_image.image_id
      JOIN media_placements placement ON placement.id = image_placement.placement_id
      WHERE post_image.post_id = ${post.id}
        AND placement.retired_at IS NULL
      ORDER BY post_image.order_index
    `)
      const revision = await createPostRevision(
        post.id,
        'update',
        {
          post_images: {
            before: previousImages.map(image => image.image_id),
            after: rows.map(image => image.image_id),
          },
        },
        currentUser.id,
        { query },
      )
      await recordPostPublicationChange(query, {
        scope: { type: 'post', postId: post.id },
        reason: 'post_content_reset',
      })
      return {
        savedImages: rows,
        rollback: {
          revisionId: revision.id,
          currentImages: rows,
          images: previousImages,
          currentLlmModerationContentSha256: moderationSha,
          llmModerationContentSha256: llm_moderation_content_sha256,
          currentLatestClearanceChangeId,
          latestClearanceChangeId: latest_clearance_change_id,
          approvedAt: approved_at,
          rejectedAt: rejected_at,
          inReviewAt: in_review_at,
          clearanceChangedById: clearance_changed_by_id,
          clearancePublicReasonCode: clearance_public_reason_code,
          clearancePrivateNote: clearance_private_note,
          clearancePlatformOverride: clearance_platform_override,
        },
      }
    }
    const result = await saveImageRows(query)
    await query.commit()
    return result
  }
  const { savedImages, rollback } = await savePostImagesInTransaction().catch(async err => {
    if (deliveryPrepared) {
      await compensateFailedImageDeliveryMutation({
        postIds: [post.id],
        imageIds: images.map(image => image.image_id),
      }).catch(onError)
    }
    if ((err as { code?: string }).code === '23503') {
      /* v8 ignore next -- defensive race fallback; validation covers normal incomplete/missing images */
      throw createHttpError(400, 'Image not found or not complete')
    }
    throw err
  })
  await completePostImageUpdate({
    postId: post.id,
    imageIds: images.map(image => image.image_id),
    rollback,
  })
  return savedImages
}
