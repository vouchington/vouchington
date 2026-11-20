import { getPostContentLimitsConfig } from '@services/post-content-limits'
import type { PostImageInput } from './images-types.mts'
import { createCodedError } from '@vouchington/sentry'
import { POST_IMAGE_LIMIT_REACHED } from '@modules/on-error/error-codes'
import { read } from '@data-stores/psql'
import { isUUID } from '@modules/utils'
import assert from 'http-assert'
import sql from 'sql-template-strings'

async function assertImagesExistForUser(
  imageIds: string[],
  userId: string,
  isAdmin: boolean,
): Promise<void> {
  if (imageIds.length === 0) return

  const { rows } = await read<{
    id: string
    created_by_id: string
  }>(sql`/* assertImagesExistForUser */
    SELECT id, created_by_id
    FROM images
    WHERE id = ANY(${imageIds}::uuid[])
      AND upload_completed_at IS NOT NULL
      AND deleted_at IS NULL
      AND quarantine_pending_at IS NULL
      AND is_flagged_by_openai_omni_moderation = FALSE
      AND openai_omni_moderation_results IS NOT NULL
      AND openai_omni_moderation_created_at IS NOT NULL
  `)

  const rowMap = new Map(rows.map(r => [r.id, r]))

  for (const imageId of imageIds) {
    const row = rowMap.get(imageId)
    assert(row !== undefined, 400, 'Image not found or not complete')
    if (!isAdmin) {
      assert(row.created_by_id === userId, 400, 'Image not found or not complete')
    }
  }
}

export async function validatePostImageInputs(
  images: PostImageInput[],
  userId: string,
  isAdmin: boolean,
): Promise<void> {
  if (images.length > getPostContentLimitsConfig().post_images_max)
    throw createCodedError(400, 'Post image limit reached', POST_IMAGE_LIMIT_REACHED)

  const imageIds = images.map(img => img.image_id)
  const uniqueImageIds = new Set(imageIds)
  assert(uniqueImageIds.size === imageIds.length, 422, 'Duplicate image_ids are not allowed')

  const orderIndexes = images.map(img => img.order_index)
  const uniqueOrderIndexes = new Set(orderIndexes)
  assert(
    uniqueOrderIndexes.size === orderIndexes.length,
    422,
    'Duplicate order_index values are not allowed',
  )

  for (const img of images) {
    assert(isUUID(img.image_id), 422, `Invalid image_id: ${img.image_id}`)
    assert(
      typeof img.order_index === 'number' &&
        Number.isInteger(img.order_index) &&
        img.order_index >= 0,
      422,
      'order_index must be a non-negative integer',
    )
    const caption = img.caption ?? ''
    assert(caption.length <= 1000, 422, 'Caption must be 1000 characters or less')
    assert(caption === caption.trim(), 422, 'Caption must not have leading or trailing whitespace')
  }

  if (imageIds.length > 0) {
    await assertImagesExistForUser(imageIds, userId, isAdmin)
  }
}
