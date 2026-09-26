import { read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { TopicClaim } from './config.mts'

const CLAIM_SELECT = sql`
  id, topic_id, claimant_user_id, verification_method,
  claimed_role, evidence, submitted_at,
  verified_at, verified_by_id, rejected_at, rejected_by_id, rejection_reason,
  revoked_at, revoked_by_id, revocation_reason,
  verification_hostname_id, verification_token_issued_at,
  domain_verified_at, updated_at
`

export async function getTopicClaimById(id: string): Promise<TopicClaim | null> {
  const { rows } = await read(
    sql`/* getTopicClaimById */
    SELECT `.append(CLAIM_SELECT).append(sql`
    FROM topic_claims WHERE id = ${id}
  `),
  )
  return (rows[0] as TopicClaim | undefined) ?? null
}

/**
 * Returns only an unresolved claim owned by the requesting claimant. Keeping the
 * ownership and lifecycle predicates in the read prevents the route preflight
 * from exposing whether another claimant's record exists.
 */
export async function getUnresolvedTopicClaimForClaimant(
  id: string,
  claimantUserId: string,
): Promise<TopicClaim | null> {
  const { rows } = await write(
    sql`/* getUnresolvedTopicClaimForClaimant */
    SELECT `.append(CLAIM_SELECT).append(sql`
    FROM topic_claims
    WHERE id = ${id}
      AND claimant_user_id = ${claimantUserId}
      AND verified_at IS NULL
      AND rejected_at IS NULL
    LIMIT 1
  `),
  )
  return (rows[0] as TopicClaim | undefined) ?? null
}

export async function getVerifiedTopicClaim(
  topicId: string,
  userId: string,
): Promise<TopicClaim | null> {
  const { rows } = await read(
    sql`/* getVerifiedTopicClaim */
    SELECT `.append(CLAIM_SELECT).append(sql`
    FROM topic_claims
    WHERE topic_id = ${topicId}
      AND claimant_user_id = ${userId}
      AND verified_at IS NOT NULL
      AND revoked_at IS NULL
    LIMIT 1
  `),
  )
  return (rows[0] as TopicClaim | undefined) ?? null
}

export async function listTopicClaimsForTopic(topicId: string): Promise<TopicClaim[]> {
  const { rows } = await read(
    sql`/* listTopicClaimsForTopic */
    SELECT `.append(CLAIM_SELECT).append(sql`
    FROM topic_claims WHERE topic_id = ${topicId}
    ORDER BY id DESC
  `),
  )
  return rows as TopicClaim[]
}

export async function listTopicClaimsForUser(userId: string): Promise<TopicClaim[]> {
  const { rows } = await read(
    sql`/* listTopicClaimsForUser */
    SELECT `.append(CLAIM_SELECT).append(sql`
    FROM topic_claims WHERE claimant_user_id = ${userId}
    ORDER BY id DESC
  `),
  )
  return rows as TopicClaim[]
}

export async function listPendingTopicClaims(): Promise<TopicClaim[]> {
  const { rows } = await read(
    sql`/* listPendingTopicClaims */
    SELECT `.append(CLAIM_SELECT).append(sql`
    FROM topic_claims
    WHERE submitted_at IS NOT NULL
      AND verified_at IS NULL
      AND rejected_at IS NULL
    ORDER BY submitted_at DESC
  `),
  )
  return rows as TopicClaim[]
}
