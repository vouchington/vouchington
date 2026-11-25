import { beginTransaction } from '@data-stores/psql'
import { getMinUuidv7ForDate } from '@modules/utils'
import { readDataRetentionField } from './config.mts'

const DAY_MS = 24 * 60 * 60 * 1_000
const identifyingKeys = `ARRAY['correlated_ips', 'ip_address', 'ipAddress', 'device_id', 'deviceId',
  'session_id', 'sessionId', 'user_agent', 'userAgent', 'user_agent_string_id']`

export type VoteIntegrityDetailCleanupPage = {
  scanned: number
  redacted: number
  hasMore: boolean
}

/** The moderation flag survives; only identifying JSON keys age out. */
export async function cleanupVoteIntegrityDetails(
  batchSize: number,
  now = new Date(),
  flagIds?: readonly string[],
): Promise<VoteIntegrityDetailCleanupPage> {
  if (!Number.isSafeInteger(batchSize) || batchSize < 1 || batchSize > 5_000) {
    throw new RangeError('Flag detail cleanup batch size must be between 1 and 5000')
  }
  if (flagIds && flagIds.length > batchSize) throw new RangeError('Scoped flags must fit one page')
  const cutoffId = getMinUuidv7ForDate(
    new Date(now.getTime() - readDataRetentionField('vote_integrity_detail_days') * DAY_MS),
  )
  await using query = await beginTransaction()
  if (!flagIds)
    await query(
      `/* ensureVoteIntegrityDetailCleanupCursor */
      INSERT INTO vote_integrity_flag_detail_cleanup_cursors (is_singleton, sweep_cutoff_id)
      VALUES (TRUE, $1::uuid) ON CONFLICT DO NOTHING`,
      [cutoffId],
    )
  const cursor = flagIds
    ? null
    : (
        await query<{ cursor_flag_id: string | null; sweep_cutoff_id: string | null }>(
          `/* readVoteIntegrityDetailCleanupCursor */ SELECT cursor_flag_id, sweep_cutoff_id
           FROM vote_integrity_flag_detail_cleanup_cursors WHERE is_singleton`,
        )
      ).rows[0]
  if (cursor && cursor.sweep_cutoff_id === null)
    await query(
      `/* startVoteIntegrityDetailCleanupSweep */
      UPDATE vote_integrity_flag_detail_cleanup_cursors SET sweep_cutoff_id = $1::uuid
      WHERE is_singleton`,
      [cutoffId],
    )
  const sweepCutoffId = cursor?.sweep_cutoff_id ?? cutoffId
  const lowerId = flagIds
    ? '00000000-0000-7000-8000-000000000000'
    : (cursor?.cursor_flag_id ?? '00000000-0000-7000-8000-000000000000')
  const scopedPredicate = flagIds ? 'AND id = ANY($3::uuid[])' : ''
  const limitPlaceholder = flagIds ? '$4' : '$3'
  const candidateArguments = flagIds
    ? [sweepCutoffId, lowerId, flagIds, batchSize]
    : [sweepCutoffId, lowerId, batchSize]
  const { rows } = await query<{ id: string }>(
    `/* redactVoteIntegrityFlagDetails */
     UPDATE vote_integrity_flags flag
     SET details = details - ${identifyingKeys}
     WHERE flag.id = ANY(ARRAY(
       SELECT id FROM vote_integrity_flags
       WHERE id < $1::uuid AND id > $2::uuid AND details ?| ${identifyingKeys}
         ${scopedPredicate}
       ORDER BY id LIMIT ${limitPlaceholder}
     ))
       AND flag.id < $1::uuid AND flag.details ?| ${identifyingKeys}
     RETURNING flag.id`,
    candidateArguments,
  )
  const hasMore = rows.length === batchSize
  const lastId = hasMore
    ? rows
        .map(row => row.id)
        .toSorted()
        .at(-1)
    : null
  if (!flagIds)
    await query(
      `/* checkpointVoteIntegrityDetailCleanupCursor */
       UPDATE vote_integrity_flag_detail_cleanup_cursors SET cursor_flag_id = $1,
         sweep_cutoff_id = CASE WHEN $2::boolean THEN sweep_cutoff_id ELSE NULL END
       WHERE is_singleton`,
      [lastId, hasMore],
    )
  await query.commit()
  return { scanned: rows.length, redacted: rows.length, hasMore }
}
