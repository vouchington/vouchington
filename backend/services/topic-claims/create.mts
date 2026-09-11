import { write, read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import assert from 'http-assert'
import type { TopicClaim } from './config.mts'
import type { CreateTopicClaimInput } from './parse.mts'

export async function createTopicClaim(
  currentUserId: string,
  input: CreateTopicClaimInput,
): Promise<{ claim: TopicClaim; isDuplicate: boolean }> {
  const topic = await resolveClaimTopic(input.topicId)
  assert(topic, 404, 'Topic not found')

  const { rows } = await write(sql`/* createTopicClaim */
    INSERT INTO topic_claims (
      topic_id,
      claimant_user_id,
      claimed_role,
      evidence,
      verification_hostname_id
    )
    VALUES (
      ${topic.id},
      ${currentUserId},
      ${input.claimedRole},
      ${input.evidence},
      ${topic.hostname_id}
    )
    ON CONFLICT (topic_id, claimant_user_id)
    WHERE rejected_at IS NULL AND revoked_at IS NULL
    DO UPDATE SET
      claimed_role = EXCLUDED.claimed_role,
      evidence = EXCLUDED.evidence,
      updated_at = CURRENT_TIMESTAMP
    RETURNING
      (xmax = 0) AS inserted,
      id, topic_id, claimant_user_id, verification_method,
      claimed_role, evidence, submitted_at,
      verified_at, verified_by_id, rejected_at, rejected_by_id, rejection_reason,
      revoked_at, revoked_by_id, revocation_reason,
      verification_hostname_id, verification_token_hash, verification_token_issued_at,
      domain_verified_at, updated_at
  `)

  const result = rows[0] as (TopicClaim & { inserted: boolean; created_at?: Date }) | undefined
  assert(result, 500, 'Failed to create topic claim')
  const { inserted, ...claim } = result
  return { claim: claim as TopicClaim, isDuplicate: !inserted }
}

interface ClaimTopic {
  id: string
  hostname_id: string | null
}

async function resolveClaimTopic(topicId: string): Promise<ClaimTopic | undefined> {
  if (isUuidIdentifier(topicId)) return resolveClaimTopicByUuid(topicId)
  return resolveClaimTopicBySlug(topicId)
}

async function resolveClaimTopicByUuid(topicId: string): Promise<ClaimTopic | undefined> {
  const { rows } = await read<ClaimTopic>(sql`/* resolveClaimTopicByUuid */
    -- no-mistakes-disable-next-line postgres-required-predicates: claim creation resolves merged source topic IDs to an active destination topic
    WITH candidates AS (
      SELECT t.id, t.hostname_id, 0 AS priority
      FROM topics t
      WHERE t.id = ${topicId}::uuid
        AND t.deleted_at IS NULL
        AND t.merged_into_topic_id IS NULL
      UNION ALL
      SELECT destination_topic.id, destination_topic.hostname_id, 1 AS priority
      FROM topics source_topic
      JOIN topics destination_topic ON destination_topic.id = source_topic.merged_into_topic_id
      WHERE source_topic.id = ${topicId}::uuid
        AND source_topic.deleted_at IS NULL
        AND source_topic.merged_into_topic_id IS NOT NULL
        AND destination_topic.deleted_at IS NULL
        AND destination_topic.merged_into_topic_id IS NULL
    )
    SELECT id, hostname_id
    FROM candidates
    ORDER BY priority, id DESC
    LIMIT 1
  `)
  return rows[0]
}

async function resolveClaimTopicBySlug(topicId: string): Promise<ClaimTopic | undefined> {
  const { rows } = await read<ClaimTopic>(sql`/* resolveClaimTopicBySlug */
    -- no-mistakes-disable-next-line postgres-required-predicates: claim creation resolves merged source topic slugs to an active destination topic
    WITH candidates AS (
      SELECT t.id, t.hostname_id, 0 AS priority
      FROM topics t
      WHERE t.slug = LOWER(${topicId})
        AND t.deleted_at IS NULL
        AND t.merged_into_topic_id IS NULL
      UNION ALL
      SELECT destination_topic.id, destination_topic.hostname_id, 1 AS priority
      FROM topics source_topic
      JOIN topics destination_topic ON destination_topic.id = source_topic.merged_into_topic_id
      WHERE source_topic.slug = LOWER(${topicId})
        AND source_topic.deleted_at IS NULL
        AND source_topic.merged_into_topic_id IS NOT NULL
        AND destination_topic.deleted_at IS NULL
        AND destination_topic.merged_into_topic_id IS NULL
    )
    SELECT id, hostname_id
    FROM candidates
    ORDER BY priority, id DESC
    LIMIT 1
  `)
  return rows[0]
}

function isUuidIdentifier(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
}
