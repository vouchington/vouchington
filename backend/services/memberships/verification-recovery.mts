import { getMembershipWorkLimit } from './work-limits.mts'
import { read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { deferClaimedMembershipVerification } from './verification-work.mts'

export type MembershipVerificationClaim = { id: string; leaseToken: string }

export async function deferMembershipVerificationUntilAdapterAvailable(
  id: string,
): Promise<boolean> {
  const claim = await claimPendingMembershipVerification(id)
  return claim
    ? deferClaimedMembershipVerification(id, claim.leaseToken, 'provider_adapter_unavailable')
    : false
}

export async function claimPendingMembershipVerification(
  id: string,
): Promise<MembershipVerificationClaim | null> {
  const duration = getMembershipWorkLimit('verification_claim_minutes')
  const { rows } = await write<{
    id: string
    lease_token: string
  }>(sql`/* claimPendingMembershipVerification */
    UPDATE membership_verification_processing_work_items work
    SET lease_token = uuidv7(), leased_at = clock_timestamp(),
      lease_expires_at = clock_timestamp() + ${duration}::integer * INTERVAL '1 minute',
      attempt_count = attempt_count + 1, last_error = NULL
    FROM membership_verifications verification
    WHERE work.membership_verification_id = ${id} AND verification.id = work.membership_verification_id
      AND verification.verified_at IS NULL AND verification.conflicted_at IS NULL AND verification.rejected_at IS NULL
      AND work.completed_at IS NULL AND work.available_at <= clock_timestamp()
      AND (work.lease_token IS NULL OR work.lease_expires_at <= clock_timestamp())
    RETURNING work.membership_verification_id AS id, work.lease_token
  `)
  return rows[0] ? { id: rows[0].id, leaseToken: rows[0].lease_token } : null
}

export async function findRecoverableMembershipVerificationIds(): Promise<string[]> {
  const limit = getMembershipWorkLimit('verification_recovery_batch_size')
  const { rows } = await read<{ id: string }>(sql`/* findRecoverableMembershipVerificationIds */
    SELECT work.membership_verification_id AS id FROM membership_verification_processing_work_items work
    WHERE work.completed_at IS NULL AND work.available_at <= clock_timestamp()
      AND (work.lease_token IS NULL OR work.lease_expires_at <= clock_timestamp())
    ORDER BY work.available_at, work.membership_verification_id LIMIT ${limit}
  `)
  return rows.map(row => row.id)
}
