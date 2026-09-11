import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import assert from 'http-assert'
import type { TopicClaim } from './config.mts'

export async function revokeTopicClaim(
  staffUserId: string,
  claimId: string,
  revocationReason: string,
): Promise<TopicClaim> {
  assert(revocationReason.trim().length > 0, 422, 'revocation_reason is required')
  const { rows } = await write(sql`/* revokeTopicClaim */
    UPDATE topic_claims
    SET revoked_at = NOW(),
        revoked_by_id = ${staffUserId},
        revocation_reason = ${revocationReason.trim()},
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ${claimId}
      AND verified_at IS NOT NULL
      AND revoked_at IS NULL
    RETURNING
      id, topic_id, claimant_user_id, verification_method,
      claimed_role, evidence, submitted_at,
      verified_at, verified_by_id, rejected_at, rejected_by_id, rejection_reason,
      revoked_at, revoked_by_id, revocation_reason,
      verification_hostname_id, verification_token_hash, verification_token_issued_at,
      domain_verified_at, updated_at
  `)
  const updated = rows[0] as TopicClaim | undefined
  assert(updated, 404, 'Claim not found or not verified/already revoked')
  return updated
}
