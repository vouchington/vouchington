import { write } from '@data-stores/psql'

export async function seedTopicMergePostReferences(input: {
  sourceId: string
  destinationId: string
  postId: string
  userId: string
  communityId: string
}) {
  const { sourceId, destinationId, postId, userId, communityId } = input
  await write(
    `/* seedTopicMergePostReferences */ WITH tags AS (
    INSERT INTO post_data_point_topics (post_id, topic_id) VALUES ($3::uuid, $1::uuid), ($3::uuid, $2::uuid)
  ), categories AS (
    INSERT INTO post_explicit_topic_categories (post_id, topic_id) VALUES ($3::uuid, $1::uuid), ($3::uuid, $2::uuid)
  ), ratings AS (
    INSERT INTO post_review_topic_ratings (post_id, topic_id, rating) VALUES ($3::uuid, $1::uuid, 1), ($3::uuid, $2::uuid, 5)
  ), lists AS (
    INSERT INTO community_list_topics (community_id, topic_id, order_index) VALUES ($5::uuid, $1::uuid, 1), ($5::uuid, $2::uuid, 9)
  ), votes AS (
    INSERT INTO topic_votes (topic_id, user_id, score) VALUES ($1::uuid, $4::uuid, -1), ($2::uuid, $4::uuid, 1)
  ) SELECT 1`,
    [sourceId, destinationId, postId, userId, communityId],
  )
}

export async function getTopicMergePostReferences(input: {
  sourceId: string
  destinationId: string
  postId: string
  userId: string
  communityId: string
}) {
  const { sourceId, destinationId, postId, userId, communityId } = input
  const { rows } = await write<{ kind: string; topic_id: string; value: number }>(
    `/* getTopicMergePostReferences */
    SELECT 'tag' AS kind, topic_id, order_index AS value FROM post_data_point_topics WHERE post_id = $3::uuid
    UNION ALL SELECT 'category', topic_id, 0 FROM post_explicit_topic_categories WHERE post_id = $3::uuid
    UNION ALL SELECT 'rating', topic_id, rating FROM post_review_topic_ratings WHERE post_id = $3::uuid
    UNION ALL SELECT 'list', topic_id, order_index FROM community_list_topics WHERE community_id = $5::uuid AND topic_id = ANY(ARRAY[$1::uuid, $2::uuid])
    UNION ALL SELECT 'vote', topic_id, score FROM topic_votes WHERE topic_id = ANY(ARRAY[$1::uuid, $2::uuid]) AND user_id = $4::uuid
    ORDER BY kind`,
    [sourceId, destinationId, postId, userId, communityId],
  )
  return rows
}

export async function seedTopicMergeDirectPostCategory(
  postId: string,
  topicId: string,
): Promise<void> {
  await write(
    `/* seedTopicMergeDirectPostCategory */ INSERT INTO post_explicit_topic_categories (post_id, topic_id)
    VALUES ($1::uuid, $2::uuid)`,
    [postId, topicId],
  )
}
