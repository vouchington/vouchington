import { getMembershipWorkLimit } from './work-limits.mts'
import { read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'

export type MembershipVerificationClaim = {
  id: string
  processingClaimToken: string
}

export async function deferMembershipVerificationUntilAdapterAvailable(
  verificationId: string,
): Promise<boolean> {
  const MEMBERSHIPS_VERIFICATION_RETRY_MINUTES = getMembershipWorkLimit(
    'verification_retry_minutes',
  )
  const claim = await claimPendingMembershipVerification(verificationId)
  if (!claim) return false
  const { rowCount } = await write(sql`/* deferMembershipVerificationUntilAdapterAvailable */
    UPDATE membership_verifications
    SET processing_claim_token = NULL,
      processing_claimed_at = NULL,
      next_processing_at = CURRENT_TIMESTAMP + ${MEMBERSHIPS_VERIFICATION_RETRY_MINUTES}::integer * INTERVAL '1 minute',
      last_error = 'provider_adapter_unavailable'
    WHERE id = ${claim.id}
      AND processing_claim_token = ${claim.processingClaimToken}
      AND verified_at IS NULL AND conflicted_at IS NULL AND rejected_at IS NULL`)
  return rowCount === 1
}

export async function claimPendingMembershipVerification(
  verificationId: string,
): Promise<MembershipVerificationClaim | null> {
  const MEMBERSHIPS_VERIFICATION_CLAIM_MINUTES = getMembershipWorkLimit(
    'verification_claim_minutes',
  )
  const { rows } = await write<{
    id: string
    processing_claim_token: string
  }>(sql`/* claimPendingMembershipVerification */
    UPDATE membership_verifications
    SET processing_claim_token = uuidv7(),
      processing_claimed_at = CURRENT_TIMESTAMP,
      processing_attempts = processing_attempts + 1,
      last_error = NULL
    WHERE id = ${verificationId}
      AND verified_at IS NULL AND conflicted_at IS NULL AND rejected_at IS NULL
      AND next_processing_at <= CURRENT_TIMESTAMP
      AND (
        processing_claim_token IS NULL
        OR processing_claimed_at < CURRENT_TIMESTAMP - ${MEMBERSHIPS_VERIFICATION_CLAIM_MINUTES}::integer * INTERVAL '1 minute'
      )
    RETURNING id, processing_claim_token`)
  const row = rows[0]
  if (!row) return null
  return { id: row.id, processingClaimToken: row.processing_claim_token }
}

export async function findRecoverableMembershipVerificationIds(): Promise<string[]> {
  const MEMBERSHIPS_VERIFICATION_CLAIM_MINUTES = getMembershipWorkLimit(
    'verification_claim_minutes',
  )
  const WORK_PAGE_SIZE = getMembershipWorkLimit('verification_recovery_batch_size')
  const { rows } = await read<{ id: string }>(sql`/* findRecoverableMembershipVerificationIds */
    SELECT id
    FROM membership_verifications
    WHERE verified_at IS NULL AND conflicted_at IS NULL AND rejected_at IS NULL
      AND next_processing_at <= CURRENT_TIMESTAMP
      AND (
        processing_claim_token IS NULL
        OR processing_claimed_at < CURRENT_TIMESTAMP - ${MEMBERSHIPS_VERIFICATION_CLAIM_MINUTES}::integer * INTERVAL '1 minute'
      )
    ORDER BY next_processing_at, id
    LIMIT ${WORK_PAGE_SIZE}`)
  return rows.map(row => row.id)
}
