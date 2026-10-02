import { write } from '@data-stores/psql'
import { pruningFixture as fixture } from './fixture-ids.mts'
import { PRUNING_PARENTS, rangeLeaf } from './partitions.mts'

export async function seedPruningProof(): Promise<void> {
  await write(
    `/* seedPruningProofUser */ INSERT INTO users (id, username) VALUES ($1, 'pruning-proof-user')`,
    [fixture.userId],
  )
  await write(
    `/* seedPruningProofTopics */ INSERT INTO topics
      (created_via, id, name, slug, bedrock_nova_multimodal_v1_content_sha256)
     VALUES ('system', $1, 'Pruning proof topic', 'pruning-proof-topic', decode(repeat('00', 32), 'hex')),
            ('system', $2, 'Pruning proof other', 'pruning-proof-other', decode(repeat('01', 32), 'hex'))`,
    [fixture.topicId, fixture.otherTopicId],
  )
  for (const [index, postId] of fixture.posts.entries()) {
    await write(
      `/* seedPruningProofPost */ INSERT INTO posts
        (created_via, id, post_type, title, created_by_id,
         bedrock_nova_multimodal_v1_content_sha256, llm_moderation_content_sha256)
       VALUES ('system', $1, 'review', $2, $3, decode(repeat('02', 32), 'hex'),
               decode(repeat('03', 32), 'hex'))`,
      [postId, `Pruning proof review ${index}`, fixture.userId],
    )
    await write(
      `/* seedPruningProofRating */ INSERT INTO post_review_topic_ratings
        (post_id, topic_id, rating) VALUES ($1, $2, $3)`,
      [postId, fixture.topicId, index + 1],
    )
  }
  for (const conversationId of fixture.conversations) {
    await write(
      `/* seedPruningProofConversation */ INSERT INTO conversations
        (id, channel_type, created_by_id) VALUES ($1, 'chat', $2)`,
      [conversationId, fixture.userId],
    )
    await write(
      `/* seedPruningProofMessage */ INSERT INTO conversation_messages
        (conversation_id, created_by_id, created_via, content)
       VALUES ($1, $2, 'system', $3::jsonb)`,
      [conversationId, fixture.userId, JSON.stringify({ role: 'user', content: 'proof' })],
    )
  }
  for (const [index, relationId] of fixture.relations.entries()) {
    await write(
      `/* seedPruningProofRelation */ INSERT INTO relation__post__category__topic
        (id, subject_id, object_id, created_by_id)
       VALUES ($1, $2, $3, $4)`,
      [relationId, fixture.posts[index], fixture.topicId, fixture.userId],
    )
    await write(
      `/* seedPruningProofVote */ INSERT INTO relation__post__category__topic__votes
        (user_id, subject_id, entity_relation_id, score)
       VALUES ($1, $2, $3, 1)`,
      [fixture.userId, fixture.posts[index], relationId],
    )
  }
  await write(
    `/* seedPruningProofOtherRelation */ INSERT INTO relation__topic__publisher_type__topic
      (id, subject_id, object_id, created_by_id) VALUES ($1, $2, $3, $4)`,
    [fixture.otherRelation, fixture.topicId, fixture.otherTopicId, fixture.userId],
  )
  await write(
    `/* seedPruningProofOtherVote */ INSERT INTO relation__topic__publisher_type__topic__votes
      (user_id, subject_id, entity_relation_id, score)
     VALUES ( $1, $2, $3, 1)`,
    [fixture.userId, fixture.topicId, fixture.otherRelation],
  )
  for (const table of [
    ...PRUNING_PARENTS,
    'relation__topic__publisher_type__topic__votes',
    'posts',
    'topics',
    'users',
  ]) {
    // All identifiers come from the fixed table list above.
    await write(`/* seedPruningProofAnalyze */ ANALYZE ${table}`)
  }
}

export async function assertPruningFixturePlacement(): Promise<Record<string, string[]>> {
  const evidence: Record<string, string[]> = {}
  for (const parent of PRUNING_PARENTS) {
    // All identifiers come from the fixed parent inventory.
    const { rows } = await write<{ leaf: string; count: string }>(
      `/* assertPruningFixturePlacement */ SELECT tableoid::regclass::text AS leaf,
          count(*)::text AS count FROM ${parent} GROUP BY leaf ORDER BY leaf`,
    )
    const expected = [
      rangeLeaf(parent, 2024),
      rangeLeaf(parent, 2025),
      `${parent}__default`,
    ].toSorted()
    if (
      rows.length !== 3 ||
      rows.some(row => row.count !== '1') ||
      rows.map(row => row.leaf).join('|') !== expected.join('|')
    ) {
      throw new Error(`${parent} must contain exactly one row in each explicit range and default`)
    }
    evidence[parent] = rows.map(row => `${row.leaf}:${row.count}`)
  }
  const { rows: otherVotes } = await write<{ count: string }>(
    `/* assertPruningFixtureOtherVote */ SELECT count(*)::text AS count
     FROM relation__topic__publisher_type__topic__votes`,
  )
  if (otherVotes[0]?.count !== '1') throw new Error('alternate concrete vote fixture is missing')
  evidence['relation__topic__publisher_type__topic__votes:other-family'] = [
    'relation__topic__publisher_type__topic:1',
  ]
  return evidence
}
