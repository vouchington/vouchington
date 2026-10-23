import { beginTransaction } from '@data-stores/psql'
import { getMaxUUIDv7ForDate } from '@modules/utils'
import { DELETED_USER_ID } from '@services/users/constants'
import type { DataRetentionLimits } from './config.mts'

type Family =
  | 'identity_verification_attempt'
  | 'user_deletion_request'
  | 'user_legal_preservation_hold'
type CleanupPage = { family: Family; scanned: number; deleted: number; hasMore: boolean }

const FAMILIES: readonly Family[] = [
  'identity_verification_attempt',
  'user_deletion_request',
  'user_legal_preservation_hold',
]

const TABLES: Record<Family, string> = {
  identity_verification_attempt: 'identity_verification_attempts',
  user_deletion_request: 'user_deletion_requests',
  user_legal_preservation_hold: 'user_legal_preservation_holds',
}

function yearsBefore(now: Date, years: number): Date {
  const cutoff = new Date(now)
  const targetYear = cutoff.getUTCFullYear() - years
  const targetMonth = cutoff.getUTCMonth()
  const targetDay = Math.min(
    cutoff.getUTCDate(),
    new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate(),
  )
  cutoff.setUTCDate(1)
  cutoff.setUTCFullYear(targetYear)
  cutoff.setUTCDate(targetDay)
  return cutoff
}

/** Each family scans at most batchSize * maxBatches UUIDv7 rows per daily run. */
export async function cleanupLegalRecords(
  limits: DataRetentionLimits,
  now = new Date(),
  recordIds?: readonly string[],
): Promise<CleanupPage[]> {
  if (recordIds && recordIds.length > limits.batchSize)
    throw new RangeError('Scoped legal record cleanup must fit one page')
  if (recordIds?.length === 0)
    return FAMILIES.map(family => ({ family, scanned: 0, deleted: 0, hasMore: false }))
  const results: CleanupPage[] = []
  for (const family of FAMILIES) {
    let scanned = 0
    let deleted = 0
    let hasMore = false
    // oxlint-disable no-await-in-loop -- each committed page advances an independent cursor.
    for (let batch = 0; batch < (recordIds ? 1 : limits.maxBatches); batch++) {
      // no-mistakes-disable-next-line query-reached-per-item: fixed legal-record families have validated maxBatches and batchSize caps with durable cursors.
      const page = await cleanupLegalRecordPage(family, limits.batchSize, now, recordIds)
      scanned += page.scanned
      deleted += page.deleted
      hasMore = page.hasMore
      if (!hasMore) break
    }
    // oxlint-enable no-await-in-loop
    results.push({ family, scanned, deleted, hasMore })
  }
  return results
}

async function cleanupLegalRecordPage(
  family: Family,
  pageSize: number,
  now: Date,
  recordIds?: readonly string[],
): Promise<CleanupPage> {
  const cutoff = yearsBefore(now, family === 'identity_verification_attempt' ? 7 : 3)
  // PostgreSQL clamps Feb 29 when adding calendar years. A one-day wider UUID bound
  // includes that anniversary; each DELETE applies the exact SQL interval predicate.
  const upperId = getMaxUUIDv7ForDate(new Date(cutoff.getTime() + 24 * 60 * 60 * 1000))
  const table = TABLES[family]
  await using query = await beginTransaction()
  if (!recordIds)
    await query(
      `/* ensureLegalRecordRetentionCursor */
     INSERT INTO legal_record_retention_cursors (family) VALUES ($1)
     ON CONFLICT DO NOTHING`,
      [family],
    )
  const progress = recordIds
    ? []
    : (
        await query<{ cursor_record_id: string | null }>(
          `/* lockLegalRecordRetentionCursor */
     SELECT cursor_record_id FROM legal_record_retention_cursors WHERE family = $1 FOR UPDATE`,
          [family],
        )
      ).rows
  const { rows: candidates } = recordIds
    ? await query<{ id: string }>(
        `/* listScopedLegalRecordRetentionCandidates */
       SELECT id FROM ${table} WHERE id = ANY($1::uuid[]) ORDER BY id`,
        [recordIds],
      )
    : await query<{ id: string }>(
        `/* listLegalRecordRetentionCandidates */
       SELECT id FROM ${table}
       WHERE id <= $1::uuid AND ($2::uuid IS NULL OR id > $2::uuid)
       ORDER BY id LIMIT $3`,
        [upperId, progress[0]?.cursor_record_id ?? null, pageSize + 1],
      )
  const pageIds = candidates.slice(0, pageSize).map(row => row.id)
  let deleted = 0
  if (pageIds.length > 0) {
    if (family === 'identity_verification_attempt') {
      const result = await query(
        `/* deleteOldTombstonedIdentityVerificationAttempts */
         DELETE FROM identity_verification_attempts attempt
         WHERE attempt.id = ANY($1::uuid[])
           AND attempt.user_id = $2::uuid
           AND attempt.created_at + INTERVAL '7 years' <= $3::timestamptz
           AND NOT EXISTS (SELECT 1 FROM identity_verification_attempts child
                           WHERE child.grant_entitlement_attempt_id = attempt.id)`,
        [pageIds, DELETED_USER_ID, now],
      )
      deleted = result.rowCount ?? 0
    } else if (family === 'user_deletion_request') {
      const result = await query(
        `/* deleteExpiredUserDeletionProof */
         DELETE FROM user_deletion_requests request
         WHERE request.id = ANY($1::uuid[])
           AND request.completed_at + INTERVAL '3 years' <= $2::timestamptz`,
        [pageIds, now],
      )
      deleted = result.rowCount ?? 0
    } else {
      await query(
        `/* enableLegalRecordRetentionDelete */ SET LOCAL app.legal_record_retention_delete = 'on'`,
      )
      const result = await query(
        `/* deleteExpiredReleasedLegalHolds */
         DELETE FROM user_legal_preservation_holds hold
         WHERE hold.id = ANY($1::uuid[])
           AND hold.released_at + INTERVAL '3 years' <= $2::timestamptz`,
        [pageIds, now],
      )
      deleted = result.rowCount ?? 0
    }
  }
  const hasMore = !recordIds && candidates.length > pageSize
  if (!recordIds)
    await query(
      `/* checkpointLegalRecordRetentionCursor */
     UPDATE legal_record_retention_cursors SET cursor_record_id = $2 WHERE family = $1`,
      [family, hasMore ? pageIds.at(-1) : null],
    )
  await query.commit()
  return { family, scanned: pageIds.length, deleted, hasMore }
}
