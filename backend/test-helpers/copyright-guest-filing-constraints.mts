import { beginTransaction, read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { renewCopyrightActionIntentLease } from '../services/copyright-notices/action-delivery-state.mts'

/** Attempt the same deferred court-event reference; commit must still require its owning case. */
export async function commitTestCopyrightCourtEvent(
  noticeId: string,
  submissionId: string,
): Promise<void> {
  await using transaction = await beginTransaction()
  await transaction(sql`/* commitTestCopyrightCourtEvent:defer */
    SET CONSTRAINTS fk_copyright_lifecycle_events__submission_notice DEFERRED
  `)
  await transaction(sql`/* commitTestCopyrightCourtEvent */
    INSERT INTO copyright_notice_lifecycle_changes (copyright_notice_id, change_type, copyright_notice_submission_id)
    VALUES (${noticeId}, 'court_or_ccb_hold_received', ${submissionId})
  `)
  try {
    await transaction.commit()
  } catch (err) {
    throw new Error('Deferred court event commit rejected', { cause: err })
  }
}

export async function readTestCopyrightBlockerGeneration(noticeId: string): Promise<string> {
  const { rows } = await read<{ generation: string }>(sql`/* readTestCopyrightBlockerGeneration */
    SELECT generation::text FROM copyright_notice_thread_blocker_generations WHERE copyright_notice_id = ${noticeId}
  `)
  if (!rows[0]) throw new Error('Owned case blocker generation disappeared')
  return rows[0].generation
}

export async function renewTestCopyrightActionLease(
  intentId: string,
  leaseToken: string,
): Promise<boolean> {
  await using transaction = await beginTransaction()
  const renewed = await renewCopyrightActionIntentLease(intentId, leaseToken, transaction)
  await transaction.commit()
  return renewed
}

export async function readTestCopyrightLeaseExpiry(intentId: string): Promise<Date> {
  const { rows } = await read<{
    lease_expires_at: Date | null
  }>(sql`/* readTestCopyrightLeaseExpiry */
    SELECT lease_expires_at FROM copyright_notice_action_work_items WHERE id = ${intentId}
  `)
  if (!rows[0]?.lease_expires_at) throw new Error('Owned action lease disappeared')
  return rows[0].lease_expires_at
}

// Epoch microseconds as bigint: text timestamptz drops trailing zeros, so strings do not order.
export async function readTestCopyrightGuestEventClocks(noticeId: string) {
  const { rows } = await read<{
    last_lifecycle_activity_at: string | null
    last_legal_activity_at: string
    updated_at: string
  }>(sql`/* readTestCopyrightGuestEventClocks */
    SELECT
      (EXTRACT(EPOCH FROM last_lifecycle_activity_at) * 1000000)::bigint::text AS last_lifecycle_activity_at,
      (EXTRACT(EPOCH FROM last_legal_activity_at) * 1000000)::bigint::text AS last_legal_activity_at,
      (EXTRACT(EPOCH FROM updated_at) * 1000000)::bigint::text AS updated_at
    FROM copyright_notices WHERE id = ${noticeId}
  `)
  const row = rows[0]
  if (!row) throw new Error('Owned notice disappeared')
  return {
    last_lifecycle_activity_at:
      row.last_lifecycle_activity_at === null ? null : BigInt(row.last_lifecycle_activity_at),
    last_legal_activity_at: BigInt(row.last_legal_activity_at),
    updated_at: BigInt(row.updated_at),
  }
}
