import { beginTransaction } from '@data-stores/psql'
import { getMaxUuidv7ForDate } from '@modules/utils'
import { shiftUtcCalendarMonths } from '@modules/utils/calendar-months'
import { DELETED_USER_ID } from '@services/users/constants'
import { assertPositiveInteger } from './normalize-positive-integer.mts'
import { getLegalRecordRetentionWindows, type DataRetentionLimits } from './config.mts'

type Family =
  | 'identity_verification_attempt'
  | 'user_deletion_request'
  | 'user_legal_preservation_hold'
type CleanupResult = { family: Family; scanned: number; deleted: number; hasMore: boolean }

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

/** Each run removes at most batchSize * maxBatches expired rows per family. */
export async function cleanupLegalRecords(
  limits: DataRetentionLimits,
  now = new Date(),
  recordIds?: readonly string[],
): Promise<CleanupResult[]> {
  const batchSize = assertPositiveInteger(limits.batchSize, 'batchSize')
  const maxBatches = assertPositiveInteger(limits.maxBatches, 'maxBatches')
  if (recordIds && recordIds.length > batchSize * maxBatches + 1)
    throw new RangeError('Scoped legal record cleanup exceeds its run cap')
  if (recordIds?.length === 0)
    return FAMILIES.map(family => ({ family, scanned: 0, deleted: 0, hasMore: false }))
  return Promise.all(
    FAMILIES.map(async family => {
      let scanned = 0
      let deleted = 0
      let hasMore = false
      // oxlint-disable no-await-in-loop -- each finite page commits before the next oldest expired page is selected.
      for (let batch = 0; batch < maxBatches; batch++) {
        // no-mistakes-disable-next-line query-reached-per-item: each call selects at most batchSize indexed expired IDs; maxBatches caps the run.
        const page = await cleanupLegalRecordPage(family, batchSize, now, recordIds)
        scanned += page.scanned
        deleted += page.deleted
        hasMore = page.hasMore
        if (!hasMore) break
      }
      // oxlint-enable no-await-in-loop
      return { family, scanned, deleted, hasMore }
    }),
  )
}

async function cleanupLegalRecordPage(
  family: Family,
  pageSize: number,
  now: Date,
  recordIds?: readonly string[],
): Promise<CleanupResult> {
  const windows = getLegalRecordRetentionWindows()
  const months =
    family === 'identity_verification_attempt'
      ? windows.identityAttemptMonths
      : family === 'user_deletion_request'
        ? windows.deletionProofMonths
        : windows.releasedHoldMonths
  const cutoff = shiftUtcCalendarMonths(now, -months)
  // Calendar-month clamping can make the exact anniversary up to three days older than cutoff.
  // The indexed bound is widened; the exact anniversary is checked again below.
  const upperDate = new Date(cutoff.getTime() + 3 * 86_400_000)
  const table = TABLES[family]
  const values: unknown[] = [
    family === 'identity_verification_attempt' ? getMaxUuidv7ForDate(upperDate) : upperDate,
    now,
    months,
  ]
  const eligible =
    family === 'identity_verification_attempt'
      ? `source.user_id = $${values.push(DELETED_USER_ID)}::uuid AND source.id <= $1::uuid
         AND source.created_at + make_interval(months => $3::integer) <= $2::timestamptz
         AND NOT EXISTS (SELECT 1 FROM identity_verification_attempts child
           WHERE child.grant_entitlement_attempt_id = source.id)`
      : family === 'user_deletion_request'
        ? `source.completed_at <= $1::timestamptz
           AND source.completed_at + make_interval(months => $3::integer) <= $2::timestamptz`
        : `source.released_at <= $1::timestamptz
           AND source.released_at + make_interval(months => $3::integer) <= $2::timestamptz`
  const scope = recordIds ? ` AND source.id = ANY($${values.push(recordIds)}::uuid[])` : ''
  const order =
    family === 'identity_verification_attempt'
      ? 'source.id'
      : family === 'user_deletion_request'
        ? 'source.completed_at, source.id'
        : 'source.released_at, source.id'
  const pageParameter = `$${values.length + 1}`
  await using query = await beginTransaction()
  if (family === 'user_legal_preservation_hold') {
    await query(
      `/* enableLegalRecordRetentionDelete */ SELECT set_config('app.legal_record_retention_delete', 'on', true),
        set_config('app.released_hold_retention_months', $1, true)`,
      [String(months)],
    )
    const { rows } = await query<{ id: string }>(
      `/* deleteExpiredReleasedLegalHoldPage */
       DELETE FROM user_legal_preservation_holds source
       WHERE source.id = ANY(ARRAY(
         SELECT source.id FROM user_legal_preservation_holds source
         WHERE ${eligible}${scope} ORDER BY ${order} LIMIT ${pageParameter}
       ))
       AND ${eligible}${scope}
       RETURNING source.id`,
      [...values, pageSize],
    )
    await query.commit()
    return { family, scanned: rows.length, deleted: rows.length, hasMore: rows.length === pageSize }
  }
  // lock-reason: prevents: a concurrent deletion-proof child write or identity grant reference during retirement; writer: deletion-request and identity verification writes.
  const { rows } = await query<{ id: string }>(
    `/* listExpiredLegalRecordPage */ SELECT source.id FROM ${table} source
     WHERE ${eligible}${scope} ORDER BY ${order} LIMIT ${pageParameter} FOR UPDATE OF source SKIP LOCKED`,
    [...values, pageSize],
  )
  const pageIds = rows.map(row => row.id)
  let deleted = 0
  if (pageIds.length) {
    const result = await query(
      `/* deleteExpiredLegalRecordPage */ DELETE FROM ${table} source
      WHERE source.id = ANY(${pageParameter}::uuid[]) AND ${eligible}${scope}`,
      [...values, pageIds],
    )
    deleted = result.rowCount ?? 0
  }
  await query.commit()
  return { family, scanned: pageIds.length, deleted, hasMore: rows.length === pageSize }
}
