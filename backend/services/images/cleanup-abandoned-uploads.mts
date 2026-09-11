import { beginTransaction } from '@data-stores/psql'
import onError from '@modules/on-error'
import { getMinUUIDv7ForDate } from '@modules/utils'
import { markImageUploadSourceDeleted } from './complete-upload-state.mts'
import { cleanupStagedUploadSource } from './cleanup-staged-upload-source.mts'
import { deleteKnownImageStorageFromS3 } from './s3-upload-lifecycle.mts'
import { enqueueExtractImageMetadata } from '@queues/images/enqueues'

const ABANDONED_THRESHOLD_HOURS = 24
const RECOVERY_THRESHOLD_HOURS = 1
const CLEANUP_BATCH_SIZE = 100
const STAGED_SOURCE_CLEANUP_CONCURRENCY = 4
const ABANDONED_UPLOAD_ERROR = 'Upload abandoned before completion'

interface AbandonedImageStorage {
  id: string
  s3_key: string
  sha_256: Buffer | null
  upload_staged_at: Date | null
}

export async function cleanupAbandonedUploads() {
  const recoveryCutoffId = getMinUUIDv7ForDate(
    new Date(Date.now() - RECOVERY_THRESHOLD_HOURS * 60 * 60 * 1000),
  )
  const cutoffId = getMinUUIDv7ForDate(
    new Date(Date.now() - ABANDONED_THRESHOLD_HOURS * 60 * 60 * 1000),
  )

  await using stagedTransaction = await beginTransaction()
  const { rows: stagedSources } = await stagedTransaction<AbandonedImageStorage>(
    `/* cleanupAbandonedUploads:stagedSources */
      SELECT id,
        s3_key,
        sha_256,
        upload_staged_at,
        upload_completed_at,
        upload_failed_at,
        deleted_at
      FROM images
      WHERE upload_staged_at IS NOT NULL
        AND upload_source_deleted_at IS NULL
        AND id < $1
        AND (
          deleted_at IS NOT NULL
          OR upload_failed_at IS NOT NULL
          OR upload_completed_at IS NOT NULL
          OR (
            upload_started_at IS NOT NULL
            AND sha_256 IS NOT NULL
            AND s3_key = encode(sha_256, 'hex')
          )
        )
      ORDER BY id
      LIMIT $2
      FOR UPDATE SKIP LOCKED
    `,
    [recoveryCutoffId, CLEANUP_BATCH_SIZE],
  )
  await stagedTransaction.commit()

  const stagedSourceResults: boolean[] = []
  for (let offset = 0; offset < stagedSources.length; offset += STAGED_SOURCE_CLEANUP_CONCURRENCY) {
    const batch = stagedSources.slice(offset, offset + STAGED_SOURCE_CLEANUP_CONCURRENCY)
    // oxlint-disable-next-line no-await-in-loop -- cap dedicated advisory-lock sessions per process
    const results = await Promise.all(batch.map(image => cleanupStagedUploadSource(image.id)))
    stagedSourceResults.push(...results)
  }

  await using recoveryTransaction = await beginTransaction()
  const { rows: recoverableRows } = await recoveryTransaction<{ id: string }>(
    `/* cleanupAbandonedUploads:recoverable */
      SELECT id
      FROM images
      WHERE deleted_at IS NULL
        AND upload_started_at IS NOT NULL
        AND upload_completed_at IS NULL
        AND upload_failed_at IS NULL
        AND sha_256 IS NOT NULL
        AND s3_key = encode(sha_256, 'hex')
        AND id < $1
      ORDER BY id
      LIMIT $2
      FOR UPDATE SKIP LOCKED
    `,
    [recoveryCutoffId, CLEANUP_BATCH_SIZE],
  )
  await recoveryTransaction.commit()

  await Promise.all(recoverableRows.map(async ({ id }) => enqueueExtractImageMetadata(id)))

  await using abandonmentTransaction = await beginTransaction()
  const { rows } = await abandonmentTransaction<AbandonedImageStorage>(
    `/* cleanupAbandonedUploads */
      WITH candidates AS (
        SELECT id
        FROM images
        WHERE deleted_at IS NULL
          AND upload_completed_at IS NULL
          AND upload_failed_at IS NULL
          AND NOT (
            upload_started_at IS NOT NULL
            AND sha_256 IS NOT NULL
            AND s3_key = encode(sha_256, 'hex')
          )
          AND id < $1
        ORDER BY id
        LIMIT $2
        FOR UPDATE SKIP LOCKED
      )
      UPDATE images
      SET deleted_at = CURRENT_TIMESTAMP,
          upload_error = $3
      FROM candidates
      WHERE images.id = candidates.id
      RETURNING images.id,
        images.s3_key,
        images.sha_256,
        images.upload_staged_at
    `,
    [cutoffId, CLEANUP_BATCH_SIZE, ABANDONED_UPLOAD_ERROR],
  )
  await abandonmentTransaction.commit()

  await Promise.all(
    rows.map(async image => {
      try {
        await deleteKnownImageStorageFromS3(image)
        await markImageUploadSourceDeleted(image.id)
      } catch (error) {
        onError(error as Error)
      }
    }),
  )

  return {
    cleaned: rows.length,
    recovered: recoverableRows.length,
    stagedSourcesDeleted: stagedSourceResults.filter(Boolean).length,
  }
}
