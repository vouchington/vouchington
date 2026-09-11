import { beginTransaction, write } from '@data-stores/psql'
import onError from '@modules/on-error'
import {
  deleteImageUploadSourceFromS3,
  deleteKnownImageStorageFromS3,
} from './s3-upload-lifecycle.mts'
import { withImageStorageLifecycleLock } from './storage-lifecycle-lock.mts'

interface RecoverableStagedSource {
  id: string
  s3_key: string
  sha_256: Buffer | null
  upload_staged_at: Date | null
  upload_failed_at: Date | null
  deleted_at: Date | null
}

// Re-read under a primary lock immediately before selecting staged-only versus known storage.
export async function cleanupStagedUploadSource(imageId: string): Promise<boolean> {
  return await withImageStorageLifecycleLock(imageId, async () =>
    cleanupStagedUploadSourceWhileLocked(imageId),
  )
}

async function cleanupStagedUploadSourceWhileLocked(imageId: string): Promise<boolean> {
  await using transaction = await beginTransaction()
  const { rows } = await transaction<RecoverableStagedSource>(
    `/* cleanupStagedUploadSource:lock */
    SELECT id, s3_key, sha_256, upload_staged_at, upload_failed_at, deleted_at
    FROM images
    WHERE id = $1
      AND upload_staged_at IS NOT NULL
      AND upload_source_deleted_at IS NULL
    FOR UPDATE
  `,
    [imageId],
  )
  const image = rows[0]
  await transaction.commit()
  if (!image) return false

  try {
    const terminal = image.deleted_at !== null || image.upload_failed_at !== null
    if (terminal) {
      await deleteKnownImageStorageFromS3(image)
    } else {
      await deleteImageUploadSourceFromS3(image)
    }
    const result = await write(
      `/* cleanupStagedUploadSource:mark */
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
        AND (
          ($2::boolean AND (deleted_at IS NOT NULL OR upload_failed_at IS NOT NULL))
          OR (
            NOT $2::boolean
            AND deleted_at IS NULL
            AND upload_failed_at IS NULL
          )
        )
    `,
      [image.id, terminal],
    )
    return result.rowCount === 1
  } catch (error) {
    onError(error as Error)
    return false
  }
}
