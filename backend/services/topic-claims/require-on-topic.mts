import assert from 'http-assert'
import { write } from '@data-stores/psql'
import { buildTopicByAnyCandidates } from '@services/topics/get'
import { isModerationStaff } from '@services/users'
import type { PrivateUser } from '@services/users/types'
import type { TopicClaim } from './config.mts'

export type TopicClaimWriteContext = {
  claim: TopicClaim
  verificationTokenHash: string | null
  currentHostnameId: string | null
  currentHostname: string | null
  verificationHostname: string | null
}

/** The path topic and the claim id must name the same claim, including after a topic merge. */
export async function requireTopicClaimOnTopic(
  idOrSlug: string,
  claimId: string,
): Promise<TopicClaimWriteContext> {
  const { candidatesSql, values } = buildTopicByAnyCandidates(idOrSlug)
  const { rows } = await write<
    TopicClaim & {
      matched_topic_id: string
      verification_token_hash: string | null
      current_hostname_id: string | null
      current_hostname: string | null
      verification_hostname: string | null
    }
  >(
    `/* requireTopicClaimOnTopic */
    WITH candidates AS (
      ${candidatesSql}
    ),
    topic_data AS (
      SELECT id FROM candidates ORDER BY priority, id DESC LIMIT 1
    ),
    matched_topic AS (
      SELECT view_topics.id FROM view_topics
      JOIN topic_data ON topic_data.id = view_topics.id
      LIMIT 1
    )
    SELECT matched_topic.id AS matched_topic_id,
      tc.id, tc.topic_id, tc.claimant_user_id, tc.verification_method,
      tc.claimed_role, tc.evidence, tc.submitted_at,
      tc.verified_at, tc.verified_by_id, tc.rejected_at, tc.rejected_by_id, tc.rejection_reason,
      tc.revoked_at, tc.revoked_by_id, tc.revocation_reason,
      tc.verification_hostname_id, tc.verification_token_issued_at,
      tc.domain_verified_at, tc.created_at, tc.updated_at,
      tc.verification_token_hash,
      topic_row.hostname_id AS current_hostname_id,
      current_hostname.hostname AS current_hostname,
      verification_hostname.hostname AS verification_hostname
    FROM matched_topic
    JOIN topics topic_row ON topic_row.id = matched_topic.id
    LEFT JOIN url_hostnames current_hostname ON current_hostname.id = topic_row.hostname_id
    LEFT JOIN topic_claims tc ON tc.id = $2 AND tc.topic_id = matched_topic.id
    LEFT JOIN url_hostnames verification_hostname
      ON verification_hostname.id = tc.verification_hostname_id`,
    [...values, claimId],
  )
  const row = rows[0]
  assert(row, 404, 'Topic not found')
  const {
    matched_topic_id: topicId,
    verification_token_hash: verificationTokenHash,
    current_hostname_id: currentHostnameId,
    current_hostname: currentHostname,
    verification_hostname: verificationHostname,
    ...claim
  } = row
  void topicId
  assert(claim.id, 404, 'Claim not found')
  return { claim, verificationTokenHash, currentHostnameId, currentHostname, verificationHostname }
}

/** Staff may read another claimant's claim on the path topic. Everyone else must own it. */
export async function getReadableTopicClaim(
  currentUser: PrivateUser,
  idOrSlug: string,
  claimId: string,
): Promise<TopicClaim> {
  const { claim } = await requireTopicClaimOnTopic(idOrSlug, claimId)
  assert(
    isModerationStaff(currentUser) || claim.claimant_user_id === currentUser.id,
    404,
    'Claim not found',
  )
  return claim
}
