import {
  finalizeClaimedMembershipVerification,
  deferClaimedMembershipVerification,
} from '../verification-work.mts'
import { beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { MembershipVerificationReasonCode } from '../verification-contract.mts'
import type { Context } from './verification-persistence.mts'

export async function finalizeVerified(
  context: Context,
  token: string,
  query: Awaited<ReturnType<typeof beginTransaction>>,
): Promise<void> {
  if (
    !(await finalizeClaimedMembershipVerification(
      query,
      context.verificationId,
      token,
      'verified',
      'verified',
    ))
  )
    throw new Error('Microsoft Store verification claim was superseded')
}

export async function reject(
  context: Context,
  token: string,
  reason: MembershipVerificationReasonCode,
  query: Awaited<ReturnType<typeof beginTransaction>>,
): Promise<void> {
  if (reason !== 'wrong_account')
    await query(sql`/* rejectMicrosoftStoreVerificationEvidence */
      UPDATE membership_provider_evidence_records SET rejected_at = clock_timestamp(), rejection_reason = ${reason}
      WHERE id = ${context.evidenceId} AND verified_at IS NULL AND rejected_at IS NULL`)
  if (
    !(await finalizeClaimedMembershipVerification(
      query,
      context.verificationId,
      token,
      'rejected',
      reason,
    ))
  )
    throw new Error('Microsoft Store verification claim was superseded')
  await query.commit()
}

export async function terminalizeConflict(
  id: string,
  token: string,
  reason: 'wrong_account' | 'competing_direct_source',
): Promise<void> {
  await using query = await beginTransaction()
  if (!(await finalizeClaimedMembershipVerification(query, id, token, 'conflict', reason))) return
  await query.commit()
}

export async function defer(id: string, token: string, error: unknown): Promise<void> {
  await deferClaimedMembershipVerification(
    id,
    token,
    error instanceof Error ? error.message : 'Microsoft Store verification retry',
  )
}
