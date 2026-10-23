import { beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type {
  StagedUploadCleanupKey,
  StagedUploadCleanupSweep,
} from '@queues/content-analysis/types'
import { getImagesWorkLimit } from './work-limits.mts'
import { cleanupStagedUploadSource } from './cleanup-staged-upload-source.mts'

const CLEANUP_CONCURRENCY = 4

const stagedPredicate = sql`upload_staged_at IS NOT NULL
  AND upload_source_deleted_at IS NULL
  AND (deleted_at IS NOT NULL OR upload_failed_at IS NOT NULL
    OR upload_completed_at IS NOT NULL
    OR (upload_started_at IS NOT NULL AND sha_256 IS NOT NULL
      AND s3_key = encode(sha_256, 'hex')))`

/** Fix one physical interval before any external deletion or retained checkpoint. */
export async function captureStagedUploadCleanupSweep(): Promise<StagedUploadCleanupSweep> {
  await using transaction = await beginTransaction()
  const { rows: clocks } = await transaction<{ cutoff: string }>(sql`
    /* captureStagedUploadCleanupSweep:clock */
    SELECT to_char((CURRENT_TIMESTAMP - ${getImagesWorkLimit('recovery_threshold_hours')} * interval '1 hour')
      AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cutoff`)
  const cutoff = clocks[0]?.cutoff
  if (!cutoff) throw new Error('Staged upload cleanup clock unavailable')
  const query = sql`/* captureStagedUploadCleanupSweep:upper */
    SELECT id, to_char(upload_staged_at AT TIME ZONE 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS staged_at
    FROM images WHERE `.append(stagedPredicate)
  query.append(sql` AND upload_staged_at < ${cutoff}::timestamptz
    ORDER BY upload_staged_at DESC, id DESC LIMIT 1`)
  const { rows } = await transaction<{ id: string; staged_at: string }>(query)
  await transaction.commit()
  const upper = rows[0] ? { id: rows[0].id, stagedAt: rows[0].staged_at } : null
  return { cutoff, upper, done: upper === null }
}

/** One bounded page; persist the position only after its actual S3 effects settle. */
export async function cleanupStagedUploadSweepPage(
  staged: StagedUploadCleanupSweep,
  save: (staged: StagedUploadCleanupSweep) => Promise<void>,
): Promise<{ stagedSourcesDeleted: number; hasMore: boolean }> {
  if (staged.done || !staged.upper) return { stagedSourcesDeleted: 0, hasMore: false }
  const batchSize = getImagesWorkLimit('cleanup_batch_size')
  await using transaction = await beginTransaction()
  const query = sql`/* cleanupStagedUploadSweepPage */
    SELECT id, to_char(upload_staged_at AT TIME ZONE 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS staged_at
    FROM images WHERE `.append(stagedPredicate)
  query.append(sql` AND upload_staged_at < ${staged.cutoff}::timestamptz
    AND (upload_staged_at, id) <=
      (${staged.upper.stagedAt}::timestamptz, ${staged.upper.id}::uuid)`)
  if (staged.after)
    query.append(sql` AND (upload_staged_at, id) >
      (${staged.after.stagedAt}::timestamptz, ${staged.after.id}::uuid)`)
  query.append(sql` ORDER BY upload_staged_at, id LIMIT ${batchSize + 1}
    FOR UPDATE`)
  const { rows: page } = await transaction<{ id: string; staged_at: string }>(query)
  await transaction.commit()
  const rows = page.slice(0, batchSize)
  let stagedSourcesDeleted = 0
  for (let offset = 0; offset < rows.length; offset += CLEANUP_CONCURRENCY) {
    const batch = rows.slice(offset, offset + CLEANUP_CONCURRENCY)
    // no-mistakes-disable-next-line query-reached-per-item: each S3 delete requires its own image lifecycle lock and re-read; the batch is capped at four and checkpoint waits for every result
    const results = await Promise.all(batch.map(row => cleanupStagedUploadSource(row.id))) // oxlint-disable-line no-await-in-loop -- settle this group before advancing
    if (results.some(result => !result))
      throw new Error('Staged upload source was not deleted; retain the sweep position')
    stagedSourcesDeleted += results.length
  }
  const last = rows.at(-1)
  const next: StagedUploadCleanupSweep = {
    ...staged,
    ...(last
      ? { after: { id: last.id, stagedAt: last.staged_at } satisfies StagedUploadCleanupKey }
      : {}),
    done: page.length <= batchSize,
  }
  await save(next)
  return { stagedSourcesDeleted, hasMore: !next.done }
}
