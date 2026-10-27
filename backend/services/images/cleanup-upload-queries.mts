import sql from 'sql-template-strings'
import type { TransactionQuery } from '@data-stores/psql'
import type {
  UploadCleanupKey,
  UploadCleanupPhase,
  UploadCleanupWindow,
} from '@queues/content-analysis/types'

export type UploadCleanupRow = {
  id: string
  staged_at: string
  s3_key: string
  sha_256: Buffer | null
  upload_staged_at: Date
}

/** Keep these predicates aligned with the three partial indexes in the canonical image creator. */
export function uploadCleanupPredicate(phase: UploadCleanupPhase) {
  if (phase === 'staged')
    return sql`upload_staged_at IS NOT NULL
      AND upload_source_deleted_at IS NULL
      AND (deleted_at IS NULL OR deletion_posts_completed_at IS NOT NULL)
      AND (quarantine_pending_at IS NULL OR quarantined_at IS NOT NULL)
      AND (deleted_at IS NOT NULL OR upload_failed_at IS NOT NULL
        OR upload_completed_at IS NOT NULL
        OR (upload_started_at IS NOT NULL AND sha_256 IS NOT NULL
          AND s3_key = encode(sha_256, 'hex')))`
  if (phase === 'recovery')
    return sql`upload_staged_at IS NOT NULL AND deleted_at IS NULL
      AND upload_started_at IS NOT NULL AND upload_completed_at IS NULL
      AND upload_failed_at IS NULL AND sha_256 IS NOT NULL
      AND s3_key = encode(sha_256, 'hex')`
  return sql`upload_staged_at IS NOT NULL AND deleted_at IS NULL
    AND upload_completed_at IS NULL AND upload_failed_at IS NULL
    AND NOT (upload_started_at IS NOT NULL AND sha_256 IS NOT NULL
      AND s3_key = encode(sha_256, 'hex'))`
}

export async function captureUploadCleanupUpper(
  transaction: TransactionQuery,
  phase: UploadCleanupPhase,
  cutoff: string,
): Promise<UploadCleanupKey | null> {
  const query = sql`/* captureUploadCleanupUpper */
    SELECT id, to_char(upload_staged_at AT TIME ZONE 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS staged_at
    FROM images WHERE `.append(uploadCleanupPredicate(phase))
  query.append(sql` AND upload_staged_at < ${cutoff}::timestamptz
    ORDER BY upload_staged_at DESC, id DESC LIMIT 1`)
  const { rows } = await transaction<{ id: string; staged_at: string }>(query)
  return rows[0] ? { id: rows[0].id, stagedAt: rows[0].staged_at } : null
}

/** The extra row is a continuation witness, never an effect or a saved cursor position. */
export async function readUploadCleanupPage(
  transaction: TransactionQuery,
  phase: UploadCleanupPhase,
  cutoff: string,
  window: UploadCleanupWindow,
  batchSize: number,
): Promise<UploadCleanupRow[]> {
  if (!window.upper || window.done) return []
  const query = sql`/* readUploadCleanupPage */
    SELECT id, s3_key, sha_256, upload_staged_at,
      to_char(upload_staged_at AT TIME ZONE 'UTC',
        'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS staged_at
    FROM images WHERE `.append(uploadCleanupPredicate(phase))
  query.append(sql` AND upload_staged_at < ${cutoff}::timestamptz
    AND (upload_staged_at, id) <= (${window.upper.stagedAt}::timestamptz, ${window.upper.id}::uuid)`)
  if (window.after)
    query.append(sql` AND (upload_staged_at, id) >
      (${window.after.stagedAt}::timestamptz, ${window.after.id}::uuid)`)
  query.append(sql` ORDER BY upload_staged_at, id LIMIT ${batchSize + 1} FOR UPDATE`)
  // Staged sources wait for earlier locks so their physical cursor never skips an unsettled row.
  if (phase !== 'staged') query.append(' SKIP LOCKED')
  const { rows } = await transaction<UploadCleanupRow>(query)
  return rows
}
