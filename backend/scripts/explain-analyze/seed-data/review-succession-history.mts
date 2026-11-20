import { beginTransaction, write } from '@data-stores/psql'
import type { TransactionQuery } from '@data-stores/psql/types'
import { contentHash, postSeedTimestampMs, seedUuid, seedUuidAtTimestamp } from './common.mts'

const start = 9_200_000
export const reviewSuccessionHistorySize = 1001
export const reviewSuccessionHistoryPostId = seedUuidAtTimestamp(
  postSeedTimestampMs(0) - 30_000,
  start,
)

/** A separate author keeps the history fanout independent of the candidate-page fixture. */
export async function seedReviewSuccessionHistory(): Promise<void> {
  await using query = await beginTransaction()
  const author = seedUuid(start, '01')
  const topic = seedUuid(start, '04')
  await query(
    `/* seedReviewSuccessionHistory */ INSERT INTO users (id, username)
     VALUES ($1, 'seed-review-succession-history') ON CONFLICT DO NOTHING`,
    [author],
  )
  await query(
    `/* seedReviewSuccessionHistory */ INSERT INTO topics
       (id, name, slug, created_by_id, created_via, gemini_embedding_2_content_sha256, bedrock_nova_multimodal_v1_content_sha256)
     VALUES ($1, 'Review succession history', 'seed-review-succession-history', $2, 'system', $3, $3)
     ON CONFLICT DO NOTHING`,
    [topic, author, contentHash('review-succession-history-topic')],
  )
  await insertReviewPosts(query, [reviewSuccessionHistoryPostId], author, null)
  const ordinaryPost = seedUuid(1, '05')
  const { rows } = await query<{ author: string; topics: string[] }>(
    `/* seedReviewSuccessionHistory */ SELECT created_by_id AS author,
       ARRAY(SELECT topic_id FROM post_review_topic_ratings WHERE post_id = posts.id ORDER BY topic_id) AS topics
     FROM posts WHERE id = $1`,
    [ordinaryPost],
  )
  const ordinary = rows[0]
  if (!ordinary?.author || ordinary.topics.length === 0)
    throw new Error('Review succession candidate fixture requires its seeded author and ratings')
  await insertHistory(
    query,
    reviewSuccessionHistoryPostId,
    author,
    [topic],
    reviewSuccessionHistorySize,
    start,
    postSeedTimestampMs(0) - 30_000,
  )
  await insertHistory(
    query,
    ordinaryPost,
    ordinary.author,
    ordinary.topics,
    1,
    start + 2000,
    postSeedTimestampMs(1),
  )
  await query.commit()
  await write(
    '/* analyzeReviewSuccessionHistory */ ANALYZE posts, post_review_topic_ratings, review_successions, review_succession_topics',
  )
}

async function insertReviewPosts(
  query: TransactionQuery,
  ids: readonly string[],
  author: string,
  archivedAt: Date | null,
): Promise<void> {
  await query(
    `/* seedReviewSuccessionHistory */ INSERT INTO posts
       (id, post_type, title, created_by_id, created_via, archived_at,
        gemini_embedding_2_content_sha256, bedrock_nova_multimodal_v1_content_sha256, llm_moderation_content_sha256)
     SELECT id, 'review', 'Review succession history', $2::uuid, 'system', $3::timestamptz, $4, $4, $4
     FROM unnest($1::uuid[]) AS input(id) ON CONFLICT DO NOTHING`,
    [ids, author, archivedAt, contentHash('review-succession-history-post')],
  )
}

async function insertHistory(
  query: TransactionQuery,
  successor: string,
  author: string,
  topics: readonly string[],
  count: number,
  ordinal: number,
  time: number,
): Promise<void> {
  const archivedAt = new Date(time + 500)
  const predecessors = Array.from({ length: count }, (_, index) =>
    seedUuidAtTimestamp(time - 1000, ordinal + index),
  )
  const histories = Array.from({ length: count }, (_, index) =>
    seedUuidAtTimestamp(time + 1000, ordinal + index),
  )
  await insertReviewPosts(query, predecessors, author, archivedAt)
  await query(
    `/* seedReviewSuccessionHistory */ INSERT INTO post_review_topic_ratings (post_id, topic_id, rating)
     SELECT post_id, topic_id, 3 FROM unnest($1::uuid[]) AS posts(post_id)
     CROSS JOIN unnest($2::uuid[]) AS topics(topic_id) ON CONFLICT DO NOTHING`,
    [[successor, ...predecessors], topics],
  )
  await query(
    `/* seedReviewSuccessionHistory */ INSERT INTO review_successions
       (id, predecessor_post_id, successor_post_id, author_user_id, predecessor_archived_at)
     SELECT id, predecessor, $3::uuid, $4::uuid, $5::timestamptz
     FROM unnest($1::uuid[], $2::uuid[]) AS input(id, predecessor) ON CONFLICT DO NOTHING`,
    [histories, predecessors, successor, author, archivedAt],
  )
  await query(
    `/* seedReviewSuccessionHistory */ INSERT INTO review_succession_topics (review_succession_id, topic_id)
     SELECT id, topic FROM unnest($1::uuid[]) AS histories(id)
     CROSS JOIN unnest($2::uuid[]) AS topics(topic) ON CONFLICT DO NOTHING`,
    [histories, topics],
  )
}
