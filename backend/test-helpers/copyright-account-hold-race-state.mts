import { v7 as uuidv7 } from 'uuid'
import { encryptSecret } from '@modules/token-secrets'
import type { PrivateUser } from '../services/users/types.mts'
import { recordModeratorAction } from '../services/moderator-actions/index.mts'
import { beginTransaction, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { readPreservationHoldsForTest } from './entities/user-legal-preservation-holds.mts'

export const copyrightAccountHoldConflict = {
  status: 'rejected',
  statusCode: 409,
  code: 'CONFLICT',
  message: 'Conflicting account preservation hold',
  causeCode: '40001',
}

/** Include atomic hold history, account dirty marker and the actual moderator audit in every matrix. */
export async function readCopyrightAccountHoldRaceState(accountId: string) {
  const [{ rows: accounts }, { rows: audits }, holds] = await Promise.all([
    write<{ pending: boolean }>(sql`/* readCopyrightAccountHoldRaceState:account */
      SELECT is_copyright_case_clock_sync_pending AS pending FROM retained_user_identities WHERE id = ${accountId}`),
    write(sql`/* readCopyrightAccountHoldRaceState:audit */
      SELECT action_type, actor_user_id, target_user_id FROM moderator_actions
      WHERE target_user_id = ${accountId} AND action_type IN ('preservation_hold_place', 'preservation_hold_release')
      ORDER BY id`),
    readPreservationHoldsForTest(accountId),
  ])
  return { pending: accounts[0]?.pending, audits, holds }
}

/** A fully committed hold dependency; the actual SERIALIZABLE request is exercised in the race. */
export async function seedCopyrightCommittedAccountHold(admin: PrivateUser, accountId: string) {
  const id = uuidv7()
  await using query = await beginTransaction()
  await query(sql`/* seedCopyrightCommittedAccountHold */
    INSERT INTO user_legal_preservation_holds (id, account_user_id, placed_by_id, reference_ciphertext)
    VALUES (${id}, ${accountId}, ${admin.id}, ${encryptSecret('committed-family-guard', `user-legal-preservation-hold:${id}`)})`)
  await query(sql`/* seedCopyrightCommittedAccountHold:pending */
    UPDATE retained_user_identities SET is_copyright_case_clock_sync_pending = true WHERE id = ${accountId}`)
  await recordModeratorAction(
    admin.id,
    { actionType: 'preservation_hold_place', targetUserId: accountId },
    { query },
  )
  await query.commit()
}

/** The page must roll back its legal clock and erasure marker with its SQL families. */
export async function readCopyrightPurgeCaseClock(noticeId: string) {
  const { rows } = await write<{
    last_legal_activity_at: Date
    last_lifecycle_activity_at: Date | null
    evidence_erased_at: Date | null
  }>(sql`/* readCopyrightPurgeCaseClock */
    SELECT last_legal_activity_at, last_lifecycle_activity_at, evidence_erased_at
    FROM copyright_notices WHERE id = ${noticeId}`)
  return rows[0] ?? null
}
