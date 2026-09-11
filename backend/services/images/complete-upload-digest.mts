import { beginTransaction, write } from '@data-stores/psql'
import onError from '@modules/on-error'
import createHttpError from 'http-errors'
import { getImageByHash, getImageById } from './get.mts'
import {
  deleteImageDeliveryAliasFromS3,
  deleteImageUploadSourceFromS3,
} from './s3-upload-lifecycle.mts'
import { withImageStorageLifecycleLock } from './storage-lifecycle-lock.mts'

type ImageRecord = NonNullable<Awaited<ReturnType<typeof getImageById>>>

export async function deletePendingImage(imageId: string): Promise<void> {
  await write(
    `/* deletePendingImage */
    DELETE FROM images WHERE id = $1
  `,
    [imageId],
  )
}

export async function persistImageHashWhileProcessing(
  hash: Buffer,
  imageId: string,
): Promise<ImageRecord> {
  const { rows } = await write<ImageRecord>(
    `/* persistHashWhileProcessing */
    UPDATE images
    SET sha_256 = $1
    WHERE id = $2
      AND deleted_at IS NULL
      AND upload_started_at IS NOT NULL
      AND upload_completed_at IS NULL
      AND upload_failed_at IS NULL
    RETURNING *
  `,
    [hash, imageId],
  )
  const image = rows[0]
  if (!image) throw createHttpError(409, 'Image upload is no longer in a processing state')
  return image
}

export async function replaceFailedImage(
  existing: ImageRecord,
  incoming: ImageRecord,
  hash: Buffer,
): Promise<ImageRecord> {
  return await withImageStorageLifecycleLock(existing.id, () =>
    replaceFailedImageWhileLocked(existing, incoming, hash),
  )
}

async function replaceFailedImageWhileLocked(
  existing: ImageRecord,
  incoming: ImageRecord,
  hash: Buffer,
): Promise<ImageRecord> {
  // Delete the failed row's source while its storage coordinates still exist. If deletion fails,
  // retain the row so a later retry can find and clean the object instead of orphaning it.
  await deleteImageUploadSourceFromS3(existing)
  await deleteImageDeliveryAliasFromS3(existing.id)

  let replacement: ImageRecord
  try {
    const replaceFailedImageInTransaction = async (): Promise<ImageRecord> => {
      await using transaction = await beginTransaction()
      const replaceFailedImageRows = async (query: typeof transaction) => {
        await query(
          `/* replaceFailedImage:delete */
        DELETE FROM images
        WHERE id = $1
          AND deleted_at IS NULL
          AND upload_failed_at IS NOT NULL
        `,
          [existing.id],
        )
        const { rows } = await query<ImageRecord>(
          `/* replaceFailedImage:persist */
        UPDATE images
        SET sha_256 = $1
        WHERE id = $2
          AND deleted_at IS NULL
          AND upload_started_at IS NOT NULL
          AND upload_completed_at IS NULL
          AND upload_failed_at IS NULL
        RETURNING *
      `,
          [hash, incoming.id],
        )
        const image = rows[0]
        if (!image) throw createHttpError(409, 'Image upload is no longer in a processing state')
        return image
      }
      const result = await replaceFailedImageRows(transaction)
      await transaction.commit()
      return result
    }
    replacement = await replaceFailedImageInTransaction()
  } catch (error) {
    if (!isUniqueViolation(error)) throw error
    const winner = await getImageByHash(hash, true)
    if (!winner) throw error
    await deleteImageUploadSourceFromS3(incoming)
    await deletePendingImage(incoming.id).catch(onError)
    if (winner.deleted_at) {
      throw createHttpError(400, 'Image was previously flagged and deleted')
    }
    return winner
  }
  return replacement
}

export function isUniqueViolation(error: unknown): error is { code: '23505' } {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === '23505')
}
