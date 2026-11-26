import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'

export const HISTORY_PER_LIVE_CLAIM = 4
const TOPIC_CLAIM_USER_PREFIX = 'explain-topic-claim-capacity-'

export async function createClaimFixtureUsers(count: number): Promise<string[]> {
  const usernames = Array.from(
    { length: count },
    (_, index) => `${TOPIC_CLAIM_USER_PREFIX}${randomUUID()}-${index}`,
  )
  const { rows } = await write<{ id: string }>(sql`
    /* seedTopicClaimCapacityUsers */
    INSERT INTO users (username)
    SELECT username FROM unnest(${usernames}::text[]) AS fixture(username)
    RETURNING id
  `)
  return rows.map(row => row.id)
}

export async function createTopicClaimFixtureTopic(): Promise<string> {
  const suffix = randomUUID()
  const { rows } = await write<{ id: string }>(sql`
    /* seedTopicClaimCapacityTopic */
    INSERT INTO topics (name, slug, bedrock_nova_multimodal_v1_content_sha256, created_via)
    VALUES (
      ${`Explain topic claim capacity ${suffix}`},
      ${`explain-topic-claim-capacity-${suffix}`},
      digest(${suffix}, 'sha256'),
      'system'
    )
    RETURNING id
  `)
  return rows[0]!.id
}

export async function insertTopicClaimFixtures(
  topicIds: readonly string[],
  claimantIds: readonly string[],
  historyPerLiveClaim = HISTORY_PER_LIVE_CLAIM,
): Promise<{ liveIds: string[]; allIds: string[] }> {
  assert.equal(topicIds.length, claimantIds.length)
  const { rows: liveRows } = await write<{ id: string }>(sql`
    /* seedTopicClaimCapacityLive */
    INSERT INTO topic_claims (topic_id, claimant_user_id, verification_method, verified_at)
    SELECT fixture.topic_id, fixture.claimant_user_id, 'manual_admin', CURRENT_TIMESTAMP
    FROM unnest(${topicIds}::uuid[], ${claimantIds}::uuid[])
      AS fixture(topic_id, claimant_user_id)
    RETURNING id
  `)
  const { rows: historyRows } = await write<{ id: string }>(sql`
    /* seedTopicClaimCapacityHistory */
    INSERT INTO topic_claims (
      topic_id, claimant_user_id, rejected_at, rejection_reason
    )
    SELECT fixture.topic_id, fixture.claimant_user_id, CURRENT_TIMESTAMP,
      'Explain analyze capacity history'
    FROM unnest(${topicIds}::uuid[], ${claimantIds}::uuid[])
      AS fixture(topic_id, claimant_user_id)
    CROSS JOIN generate_series(1, ${historyPerLiveClaim}::int)
    RETURNING id
  `)
  return {
    liveIds: liveRows.map(row => row.id),
    allIds: [...liveRows, ...historyRows].map(row => row.id),
  }
}

export async function deleteTopicClaimFixtures(userIds: readonly string[]) {
  await write(sql`/* deleteTopicClaimCapacityClaims */
    DELETE FROM topic_claims WHERE claimant_user_id = ANY(${userIds}::uuid[])`)
  await write(sql`/* deleteTopicClaimCapacityUsers */
    DELETE FROM users WHERE id = ANY(${userIds}::uuid[])`)
}

export async function deleteTopicClaimFixtureTopic(topicId: string) {
  await write(sql`/* deleteTopicClaimCapacityTopic */
    DELETE FROM topics WHERE id = ${topicId}`)
  await write(sql`/* deleteTopicClaimCapacityTopicIdentity */
    DELETE FROM retained_topic_identities WHERE id = ${topicId}`)
}
