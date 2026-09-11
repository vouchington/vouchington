import { beginTransaction } from '@data-stores/psql'
import createHttpError from 'http-errors'
import { deriveUploadStatus } from './get-upload-state.mts'
import { getImageById } from './get.mts'

export type ImageUploadRecord = NonNullable<Awaited<ReturnType<typeof getImageById>>>

export async function claimImageUpload(
  userId: string,
  imageId: string,
): Promise<{ claimed: boolean; image: ImageUploadRecord }> {
  await using transaction = await beginTransaction()
  const { rows } = await transaction<ImageUploadRecord>(
    `/* claimImageUpload:lock */
    SELECT *
    FROM images
    WHERE id = $1
    FOR UPDATE
  `,
    [imageId],
  )
  const image = rows[0]
  if (!image || image.deleted_at) throw createHttpError(404, 'Image not found')
  if (image.created_by_id !== userId) {
    throw createHttpError(403, 'Not authorized to complete this upload')
  }

  const status = deriveUploadStatus(image)
  if (status === 'complete') {
    await transaction.commit()
    return { claimed: false, image }
  }
  if (status === 'processing') throw createHttpError(409, 'Upload is already being processed')
  if (status !== 'pending') {
    throw createHttpError(400, `Cannot complete upload with status: ${status}`)
  }

  const { rows: claimedRows } = await transaction<ImageUploadRecord>(
    `/* claimImageUpload:update */
    UPDATE images
    SET upload_started_at = CURRENT_TIMESTAMP
    WHERE id = $1
      AND deleted_at IS NULL
      AND upload_started_at IS NULL
      AND upload_completed_at IS NULL
      AND upload_failed_at IS NULL
    RETURNING *
  `,
    [imageId],
  )
  const claimed = claimedRows[0]
  if (!claimed) throw createHttpError(409, 'Upload is already being processed')
  await transaction.commit()
  return { claimed: true, image: claimed }
}

export async function persistPromotedImageKey(
  imageId: string,
  sha256: Buffer,
  s3Key: string,
): Promise<ImageUploadRecord> {
  await using transaction = await beginTransaction()
  const { rows } = await transaction<ImageUploadRecord>(
    `/* persistPromotedImageKey:lock */
    SELECT *
    FROM images
    WHERE id = $1
    FOR UPDATE
  `,
    [imageId],
  )
  const image = rows[0]
  if (
    !image ||
    image.deleted_at ||
    image.upload_started_at === null ||
    image.upload_completed_at !== null ||
    image.upload_failed_at !== null ||
    !image.sha_256 ||
    !Buffer.from(image.sha_256).equals(sha256)
  ) {
    throw createHttpError(409, 'Image upload is no longer eligible for promotion')
  }

  const { rows: updatedRows } = await transaction<ImageUploadRecord>(
    `/* persistPromotedImageKey:update */
    UPDATE images
    SET s3_key = $1
    WHERE id = $2
    RETURNING *
  `,
    [s3Key, imageId],
  )
  await transaction.commit()
  return updatedRows[0]!
}

export async function markImageUploadSourceDeleted(imageId: string): Promise<void> {
  await using transaction = await beginTransaction()
  await transaction(
    `/* markImageUploadSourceDeleted:lock */
    SELECT id
    FROM images
    WHERE id = $1
    FOR UPDATE
  `,
    [imageId],
  )
  await transaction(
    `/* markImageUploadSourceDeleted:update */
    UPDATE images
    SET upload_source_deleted_at = CURRENT_TIMESTAMP,
        sha_256 = CASE
          WHEN deleted_at IS NOT NULL
            AND upload_completed_at IS NULL
          THEN NULL
          ELSE sha_256
        END
    WHERE id = $1
      AND upload_source_deleted_at IS NULL
  `,
    [imageId],
  )
  await transaction.commit()
}
