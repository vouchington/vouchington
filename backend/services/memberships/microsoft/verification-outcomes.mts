import { beginTransaction, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { MembershipVerificationReasonCode } from '../verification-contract.mts'
import type { Context } from './verification-persistence.mts'

export async function finalizeVerified(
  context: Context,
  token: string,
  query: Awaited<ReturnType<typeof beginTransaction>>,
): Promise<void> {
  const { rowCount } = await query(
    sql`/* finalizeMicrosoftStoreVerification */ UPDATE membership_verifications SET verified_at = CURRENT_TIMESTAMP, result_code = 'verified', processing_claim_token = NULL, processing_claimed_at = NULL, next_processing_at = NULL, last_error = NULL WHERE id = ${context.verificationId} AND processing_claim_token = ${token} AND verified_at IS NULL AND conflicted_at IS NULL AND rejected_at IS NULL`,
  )
  if (rowCount !== 1) throw new Error('Microsoft Store verification claim was superseded')
}

export async function reject(
  context: Context,
  token: string,
  reason: MembershipVerificationReasonCode,
  query: Awaited<ReturnType<typeof beginTransaction>>,
): Promise<void> {
  if (reason !== 'wrong_account')
    await query(
      sql`/* rejectMicrosoftStoreVerificationEvidence */ UPDATE membership_provider_evidence_records SET rejected_at = CURRENT_TIMESTAMP, rejection_reason = ${reason} WHERE id = ${context.evidenceId} AND verified_at IS NULL AND rejected_at IS NULL`,
    )
  await query(
    sql`/* finalizeRejectedMicrosoftStoreVerification */ UPDATE membership_verifications SET rejected_at = CURRENT_TIMESTAMP, result_code = ${reason}, processing_claim_token = NULL, processing_claimed_at = NULL, next_processing_at = NULL, last_error = NULL WHERE id = ${context.verificationId} AND processing_claim_token = ${token} AND verified_at IS NULL AND conflicted_at IS NULL AND rejected_at IS NULL`,
  )
  await query.commit()
}

export async function terminalizeConflict(
  id: string,
  token: string,
  reason: 'wrong_account' | 'competing_direct_source',
): Promise<void> {
  await write(
    sql`/* terminalizeMicrosoftStoreConflict */ UPDATE membership_verifications SET conflicted_at = CURRENT_TIMESTAMP, result_code = ${reason}, processing_claim_token = NULL, processing_claimed_at = NULL, next_processing_at = NULL, last_error = NULL WHERE id = ${id} AND processing_claim_token = ${token} AND verified_at IS NULL AND conflicted_at IS NULL AND rejected_at IS NULL`,
  )
}

export async function defer(id: string, token: string, error: unknown): Promise<void> {
  const message =
    error instanceof Error ? error.message.slice(0, 1000) : 'Microsoft Store verification retry'
  await write(
    sql`/* deferMicrosoftStoreVerification */ UPDATE membership_verifications SET processing_claim_token = NULL, processing_claimed_at = NULL, next_processing_at = CURRENT_TIMESTAMP + INTERVAL '5 minutes', last_error = ${message} WHERE id = ${id} AND processing_claim_token = ${token} AND verified_at IS NULL AND conflicted_at IS NULL AND rejected_at IS NULL`,
  )
}
