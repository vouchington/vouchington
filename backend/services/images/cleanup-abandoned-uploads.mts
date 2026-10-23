import { getImagesWorkLimit } from './work-limits.mts'
import { beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import onError from '@modules/on-error'
import { markImageUploadSourceDeleted } from './complete-upload-state.mts'
import { deleteKnownImageStorageFromS3 } from './s3-upload-lifecycle.mts'
import { enqueueExtractImageMetadata } from '@queues/image-uploads/enqueues'

const ABANDONED_UPLOAD_ERROR = 'Upload abandoned before completion'

interface AbandonedImageStorage {
  id: string
  s3_key: string
  sha_256: Buffer | null
  upload_staged_at: Date | null
}

export interface AbandonedUploadScope {
  readonly imageIds: readonly string[]
  readonly now: Date
}

export async function cleanupAbandonedUploads(scope?: AbandonedUploadScope) {
  const imageIds = scope ? Object.freeze([...scope.imageIds]) : undefined
  const now = scope ? scope.now.getTime() : Date.now()
  if (!Number.isFinite(now)) throw new RangeError('Invalid cleanup clock')
  const ABANDONED_THRESHOLD_HOURS = getImagesWorkLimit('abandoned_threshold_hours')
  const RECOVERY_THRESHOLD_HOURS = getImagesWorkLimit('recovery_threshold_hours')
  const CLEANUP_BATCH_SIZE = getImagesWorkLimit('cleanup_batch_size')
  const recoveryCutoff = new Date(now - RECOVERY_THRESHOLD_HOURS * 60 * 60 * 1000)
  const abandonmentCutoff = new Date(now - ABANDONED_THRESHOLD_HOURS * 60 * 60 * 1000)

  await using recoveryTransaction = await beginTransaction()
  const recoveryQuery = sql`/* cleanupAbandonedUploads:recoverable */
      SELECT id
      FROM images
      WHERE deleted_at IS NULL
        AND upload_staged_at IS NOT NULL
        AND upload_staged_at < ${recoveryCutoff}
        AND upload_started_at IS NOT NULL
        AND upload_completed_at IS NULL
        AND upload_failed_at IS NULL
        AND sha_256 IS NOT NULL
        AND s3_key = encode(sha_256, 'hex')`
  if (imageIds) recoveryQuery.append(sql` AND id = ANY(${imageIds}::uuid[])`)
  recoveryQuery.append(sql`
      ORDER BY upload_staged_at, id
      LIMIT ${CLEANUP_BATCH_SIZE}
      FOR UPDATE SKIP LOCKED
    `)
  const { rows: recoverableRows } = await recoveryTransaction<{ id: string }>(recoveryQuery)
  await recoveryTransaction.commit()

  await Promise.all(recoverableRows.map(async ({ id }) => enqueueExtractImageMetadata(id)))

  await using abandonmentTransaction = await beginTransaction()
  const abandonmentQuery = sql`/* cleanupAbandonedUploads */
      WITH candidates AS (
        SELECT id
        FROM images
        WHERE deleted_at IS NULL
          AND upload_staged_at IS NOT NULL
          AND upload_staged_at < ${abandonmentCutoff}
          AND upload_completed_at IS NULL
          AND upload_failed_at IS NULL
          AND NOT (
            upload_started_at IS NOT NULL
            AND sha_256 IS NOT NULL
            AND s3_key = encode(sha_256, 'hex')
          )`
  if (imageIds) abandonmentQuery.append(sql` AND id = ANY(${imageIds}::uuid[])`)
  abandonmentQuery.append(sql`
        ORDER BY upload_staged_at, id
        LIMIT ${CLEANUP_BATCH_SIZE}
        FOR UPDATE SKIP LOCKED
      )
      UPDATE images
      SET deleted_at = CURRENT_TIMESTAMP,
          upload_error = ${ABANDONED_UPLOAD_ERROR}
      FROM candidates
      WHERE images.id = candidates.id
      RETURNING images.id,
        images.s3_key,
        images.sha_256,
        images.upload_staged_at
    `)
  const { rows } = await abandonmentTransaction<AbandonedImageStorage>(abandonmentQuery)
  await abandonmentTransaction.commit()

  await Promise.all(
    rows.map(async image => {
      try {
        await deleteKnownImageStorageFromS3(image)
        await markImageUploadSourceDeleted(image.id)
      } catch (err) {
        onError(err as Error)
      }
    }),
  )

  return {
    cleaned: rows.length,
    recovered: recoverableRows.length,
  }
}
