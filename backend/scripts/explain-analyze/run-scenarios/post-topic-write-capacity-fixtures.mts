import { beginTransaction, write, type TransactionQuery } from '@data-stores/psql'
import { insertPostDataPointTopics } from '@services/posts/data-point-topics'
import { insertTestPost } from '@voucha/test-helpers/entities/posts'
import { v7 as uuidv7 } from 'uuid'
import { postSeedTimestampMs } from '../seed-data/common.mts'
import { seedUser } from '../run-support.mts'

export async function seedPointTopics(postId: string, topicIds: string[]): Promise<void> {
  await using query = await beginTransaction()
  await insertPostDataPointTopics(postId, topicIds, { query })
  await query.commit()
}

export async function postTopicFixture(
  type: 'review' | 'data_point',
  run: (postId: string) => Promise<void>,
): Promise<void> {
  // Route the foreground post to the same id partition as the seeded neighbor rows.
  const id = uuidv7({ msecs: postSeedTimestampMs(0) })
  await insertTestPost({
    id,
    title: 'Post topic write capacity',
    slug: `explain-post-topics-${id}`,
    markdown: '',
    postType: type,
    clearanceStatus: 'pending',
    createdById: seedUser.id,
  })
  try {
    await run(id)
  } finally {
    await write('/* cleanupPostTopicWriteFixture */ DELETE FROM posts WHERE id = $1', [id])
  }
}

export async function cardTopicFixture(
  count: number,
  run: (topicIds: string[]) => Promise<void>,
): Promise<void> {
  const topicIds = Array.from({ length: count }, () => uuidv7())
  // Seed the base and subtype rows together so this is a real credit-card topic set.
  await write(
    `/* seedPostTopicWriteCards */
    WITH cards AS (
      INSERT INTO topics(
        id, name, slug, created_via, created_by_id, topic_type, bedrock_nova_multimodal_v1_content_sha256
      )
      SELECT id, 'Post topic write capacity ' || id, 'explain-post-topic-' || id, 'system', $2, 'card',
        digest('Post topic write capacity ' || id, 'sha256')
      FROM unnest($1::uuid[]) AS card(id)
      RETURNING id
    )
    INSERT INTO card_topics (topic_id) SELECT id FROM cards`,
    [topicIds, seedUser.id],
  )
  try {
    await run(topicIds)
  } finally {
    await write('/* cleanupPostTopicWriteCards */ DELETE FROM topics WHERE id = ANY($1::uuid[])', [
      topicIds,
    ])
  }
}

export function dataPointInput(topicIds: string[]) {
  return {
    data_point_vertical: 'credit_card',
    structured_data: {
      vertical: 'credit_card',
      schema_version: 1,
      currency: 'usd',
      topic_ids: topicIds,
      result: 'approved',
      credit_score_range: '740-799',
    },
  }
}

export function orderedTopics(topicIds: string[]) {
  return topicIds.map((topic_id, order_index) => ({ topic_id, order_index }))
}

export async function readRatings(query: TransactionQuery, postId: string) {
  const { rows } = await query<{ topic_id: string; rating: number; order_index: number }>(
    `/* inspectPostTopicWriteRatings */ SELECT topic_id, rating, order_index
     FROM post_review_topic_ratings WHERE post_id = $1 ORDER BY order_index, topic_id`,
    [postId],
  )
  return rows
}

export async function readPointTopics(query: TransactionQuery, postId: string) {
  const { rows } = await query<{ topic_id: string; order_index: number }>(
    `/* inspectPostTopicWritePointTopics */ SELECT topic_id, order_index
     FROM post_data_point_topics WHERE post_id = $1 ORDER BY order_index, topic_id`,
    [postId],
  )
  return rows
}
