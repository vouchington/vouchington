import { finalizePendingMembershipVerification } from '../verification-work.mts'
import { beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { MembershipVerificationReasonCode } from '../verification-contract.mts'
import type { Context } from './verification-persistence.mts'

export async function finalizeVerified(
  context: Context,
  query: Awaited<ReturnType<typeof beginTransaction>>,
): Promise<void> {
  if (
    !(await finalizePendingMembershipVerification(
      query,
      context.verificationId,
      'verified',
      'verified',
    ))
  )
    throw new Error('Microsoft Store verification outcome was already recorded')
}

export async function reject(
  context: Context,
  reason: MembershipVerificationReasonCode,
  query: Awaited<ReturnType<typeof beginTransaction>>,
): Promise<void> {
  if (reason !== 'wrong_account')
    await query(sql`/* rejectMicrosoftStoreVerificationEvidence */
      UPDATE membership_provider_evidence_records SET rejected_at = clock_timestamp(), rejection_reason = ${reason}
      WHERE id = ${context.evidenceId} AND verified_at IS NULL AND rejected_at IS NULL`)
  if (
    !(await finalizePendingMembershipVerification(
      query,
      context.verificationId,
      'rejected',
      reason,
    ))
  )
    throw new Error('Microsoft Store verification outcome was already recorded')
  await query.commit()
}

export async function terminalizeConflict(
  id: string,
  reason: 'wrong_account' | 'competing_direct_source',
): Promise<void> {
  await using query = await beginTransaction()
  if (!(await finalizePendingMembershipVerification(query, id, 'conflict', reason))) return
  await query.commit()
}
