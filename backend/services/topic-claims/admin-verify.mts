import { recordModeratorAction } from '@services/moderator-actions'
import { runWithTransaction, type TransactionQuery } from '@data-stores/psql'
import sql from 'sql-template-strings'
import assert from 'http-assert'
import type { TopicClaim } from './config.mts'

const CLAIM_RETURNING = sql`
  id, topic_id, claimant_user_id, verification_method,
  claimed_role, evidence, submitted_at,
  verified_at, verified_by_id, rejected_at, rejected_by_id, rejection_reason,
  revoked_at, revoked_by_id, revocation_reason,
  verification_hostname_id, verification_token_issued_at,
  domain_verified_at, created_at, updated_at
`

export async function adminVerifyTopicClaim(
  staffUserId: string,
  claimId: string,
  options: { query?: TransactionQuery } = {},
): Promise<TopicClaim> {
  return runWithTransaction(options.query, async transaction => {
    const { rows } = await transaction(
      sql`/* adminVerifyTopicClaim */
    UPDATE topic_claims
    SET verification_method = 'manual_admin',
        submitted_at = COALESCE(submitted_at, NOW()),
        verified_at = NOW(),
        verified_by_id = ${staffUserId}
    WHERE id = ${claimId}
      AND verified_at IS NULL
      AND rejected_at IS NULL
    RETURNING `.append(CLAIM_RETURNING),
    )
    const updated = rows[0] as TopicClaim | undefined
    assert(updated, 404, 'Claim not found or already resolved')
    await recordModeratorAction(
      staffUserId,
      { actionType: 'topic_claim_verify', topicClaimId: claimId },
      { query: transaction },
    )
    return updated
  })
}

export async function rejectTopicClaim(
  staffUserId: string,
  claimId: string,
  rejectionReason: string,
  options: { query?: TransactionQuery } = {},
): Promise<TopicClaim> {
  assert(rejectionReason.trim().length > 0, 422, 'rejection_reason is required')
  return runWithTransaction(options.query, async transaction => {
    const { rows } = await transaction(
      sql`/* rejectTopicClaim */
    UPDATE topic_claims
    SET rejected_at = NOW(),
        rejected_by_id = ${staffUserId},
        rejection_reason = ${rejectionReason.trim()}
    WHERE id = ${claimId}
      AND verified_at IS NULL
      AND rejected_at IS NULL
    RETURNING `.append(CLAIM_RETURNING),
    )
    const updated = rows[0] as TopicClaim | undefined
    assert(updated, 404, 'Claim not found or already resolved')
    await recordModeratorAction(
      staffUserId,
      { actionType: 'topic_claim_reject', topicClaimId: claimId, reason: rejectionReason.trim() },
      { query: transaction },
    )
    return updated
  })
}
