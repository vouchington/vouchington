import assert from 'http-assert'
import { write } from '@data-stores/psql'
import { buildTopicByAnyCandidates } from '@services/topics/get'
import { isModerationStaff } from '@services/users'
import type { PrivateUser } from '@services/users/types'
import type { TopicClaim } from './config.mts'
import { CANONICAL_TOPIC_LABEL_SQL, canonicalTopicLabelJoins } from '@modules/topic-labels'

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
      claim_label_topic_id: string | null
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
      SELECT view_topics.id, view_topics.hostname_id FROM view_topics
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
      ${CANONICAL_TOPIC_LABEL_SQL} AS topic_name,
      topic_label_destination.id AS claim_label_topic_id,
      claimant_profile.username AS claimant_username,
      claimant_profile.verified_display_name AS claimant_display_name,
      tc.verification_token_hash,
      matched_topic.hostname_id AS current_hostname_id,
      current_hostname.hostname AS current_hostname,
      verification_hostname.hostname AS verification_hostname
    FROM matched_topic
    LEFT JOIN url_hostnames current_hostname ON current_hostname.id = matched_topic.hostname_id
    LEFT JOIN topic_claims tc ON tc.id = $2
    ${canonicalTopicLabelJoins('claim')}
    LEFT JOIN view_users_public claimant_profile ON claimant_profile.id = tc.claimant_user_id
    LEFT JOIN url_hostnames verification_hostname
      ON verification_hostname.id = tc.verification_hostname_id`,
    [...values, claimId],
  )
  const row = rows[0]
  assert(row, 404, 'Topic not found')
  const {
    matched_topic_id: topicId,
    claim_label_topic_id: claimTopicId,
    verification_token_hash: verificationTokenHash,
    current_hostname_id: currentHostnameId,
    current_hostname: currentHostname,
    verification_hostname: verificationHostname,
    ...claim
  } = row
  assert(claim.id && claimTopicId === topicId, 404, 'Claim not found')
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
