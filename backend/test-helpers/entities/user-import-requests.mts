import { read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'

type TopicImportRequestForTest = {
  topic_id: string | null
  rss_feed_id: string | null
  topic_recommendation_post_id: string | null
  followed_at: Date | null
  input_value: string
}

type RssFeedImportRequestForTest = {
  topic_id: string | null
  rss_feed_id: string | null
  followed_at: Date | null
  input_value: string
}

/** Expires one actor/key-scoped topic-import attempt without touching shared test rows. */
export async function expireTopicImportAttemptForTest(
  userId: string,
  idempotencyKey: string,
  retentionExpiresAt: Date,
): Promise<void> {
  await write(sql`/* expireTopicImportAttemptForTest */
    UPDATE user_topic_import_attempts
    SET retention_expires_at = ${retentionExpiresAt}
    WHERE user_id = ${userId} AND idempotency_key = ${idempotencyKey}`)
}

export async function deleteTopicImportAttemptForTest(
  userId: string,
  idempotencyKey: string,
): Promise<void> {
  await write(sql`/* deleteTopicImportAttemptForTest */
    DELETE FROM user_topic_import_attempts
    WHERE user_id = ${userId} AND idempotency_key = ${idempotencyKey}`)
}

export async function topicImportAttemptExistsForTest(
  userId: string,
  idempotencyKey: string,
): Promise<boolean> {
  const result = await write<{ exists: boolean }>(sql`/* topicImportAttemptExistsForTest */
    SELECT EXISTS (
      SELECT 1 FROM user_topic_import_attempts
      WHERE user_id = ${userId} AND idempotency_key = ${idempotencyKey}
    ) AS exists`)
  return result.rows[0]?.exists ?? false
}

export async function getTopicImportAttemptRetentionExpiryForTest(
  userId: string,
  idempotencyKey: string,
): Promise<Date | null> {
  const result = await read<{
    retention_expires_at: Date
  }>(sql`/* getTopicImportAttemptRetentionExpiryForTest */
    SELECT retention_expires_at
    FROM user_topic_import_attempts
    WHERE user_id = ${userId} AND idempotency_key = ${idempotencyKey}`)
  return result.rows[0]?.retention_expires_at ?? null
}

export async function getRssFeedImportRequestForTest(
  userId: string,
  rssFeedId: string,
): Promise<RssFeedImportRequestForTest | null> {
  const { rows } = await read(sql`/* getRssFeedImportRequestForTest */
    SELECT topic_id, rss_feed_id, followed_at, input_value
    FROM user_import_requests
    WHERE user_id = ${userId}
      AND rss_feed_id = ${rssFeedId}
    LIMIT 1
  `)
  return (rows[0] as RssFeedImportRequestForTest | undefined) ?? null
}

export async function getTopicImportRequestForTest(
  userId: string,
  topicId: string,
): Promise<Pick<
  TopicImportRequestForTest,
  'topic_id' | 'topic_recommendation_post_id' | 'followed_at' | 'input_value'
> | null> {
  const { rows } = await read(sql`/* getTopicImportRequestForTest */
    SELECT topic_id, topic_recommendation_post_id, followed_at, input_value
    FROM user_import_requests
    WHERE user_id = ${userId}
      AND topic_id = ${topicId}
    LIMIT 1
  `)
  return (
    (rows[0] as
      | Pick<
          TopicImportRequestForTest,
          'topic_id' | 'topic_recommendation_post_id' | 'followed_at' | 'input_value'
        >
      | undefined) ?? null
  )
}

export async function insertPendingTopicImportRequestForTest(
  userId: string,
  recommendationPostId: string,
  inputValue: string,
): Promise<void> {
  await write(sql`/* insertPendingTopicImportRequestForTest */
    INSERT INTO user_import_requests (
      user_id,
      entity_type,
      topic_recommendation_post_id,
      input_value
    )
    VALUES (
      ${userId},
      'topic',
      ${recommendationPostId},
      ${inputValue}
    )
  `)
}

export async function getTopicImportRequestByRecommendationForTest(
  userId: string,
  recommendationPostId: string,
): Promise<Pick<
  TopicImportRequestForTest,
  'topic_id' | 'topic_recommendation_post_id' | 'followed_at' | 'input_value'
> | null> {
  const { rows } = await read(sql`/* getTopicImportRequestByRecommendationForTest */
    SELECT topic_id, topic_recommendation_post_id, followed_at, input_value
    FROM user_import_requests
    WHERE user_id = ${userId}
      AND topic_recommendation_post_id = ${recommendationPostId}
    LIMIT 1
  `)
  return (
    (rows[0] as
      | Pick<
          TopicImportRequestForTest,
          'topic_id' | 'topic_recommendation_post_id' | 'followed_at' | 'input_value'
        >
      | undefined) ?? null
  )
}

export async function getTopicImportRequestCountByRecommendationForTest(
  userId: string,
  recommendationPostId: string,
): Promise<number> {
  const { rows } = await read<{
    count: string
  }>(sql`/* getTopicImportRequestCountByRecommendationForTest */
    SELECT COUNT(*)::text AS count
    FROM user_import_requests
    WHERE user_id = ${userId}
      AND topic_recommendation_post_id = ${recommendationPostId}`)
  return Number(rows[0]?.count ?? 0)
}

export async function getTopicFollowExistsForTest(
  userId: string,
  topicId: string,
): Promise<boolean> {
  const { rows } = await read(sql`/* getTopicFollowExistsForTest */
    SELECT 1
    FROM relation__user__follow__topic
    WHERE subject_id = ${userId}
      AND object_id = ${topicId}
      AND deleted_at IS NULL
    LIMIT 1
  `)
  return rows.length > 0
}

export async function getRssFeedFollowExistsForTest(
  userId: string,
  rssFeedId: string,
): Promise<boolean> {
  const { rows } = await read(sql`/* getRssFeedFollowExistsForTest */
    SELECT 1
    FROM relation__user__follow__rss_feed
    WHERE subject_id = ${userId}
      AND object_id = ${rssFeedId}
      AND deleted_at IS NULL
    LIMIT 1
  `)
  return rows.length > 0
}
