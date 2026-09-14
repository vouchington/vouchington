import { read } from '@data-stores/psql'
import { isUUID } from '@modules/utils'
import assert from 'http-assert'
import sql from 'sql-template-strings'
import type { PostImageInput } from './images.mts'

async function assertImagesExistForUser(
  imageIds: string[],
  userId: string,
  isAdmin: boolean,
): Promise<void> {
  if (imageIds.length === 0) return

  const { rows } = await read(sql`/* assertImagesExistForUser */
    SELECT id, created_by_id
    FROM images
    WHERE id = ANY(${imageIds}::uuid[])
      AND upload_completed_at IS NOT NULL
      AND deleted_at IS NULL
      AND quarantine_pending_at IS NULL
  `)

  const rowMap = new Map(rows.map((r: { id: string; created_by_id: string }) => [r.id, r]))

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
  assert(images.length <= 20, 422, 'A post can have at most 20 images')

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
