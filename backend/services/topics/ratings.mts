import { enqueueBulkRefreshTopicMetricsById } from '@queues/entity-metrics-cache-refresh/enqueues'
import { beginTransaction, write, type TransactionQuery } from '@data-stores/psql'
import type { TopicRatingStats } from './types.mts'
import { normalizeTopicRatingStats } from './normalize-rating-stats.mts'
import sql from 'sql-template-strings'

const ratingStatsKeys = [
  'ratings__score__1',
  'ratings__score__2',
  'ratings__score__3',
  'ratings__score__4',
  'ratings__score__5',
  'ratings__count__1',
  'ratings__count__2',
  'ratings__count__3',
  'ratings__count__4',
  'ratings__count__5',
] as const satisfies ReadonlyArray<keyof TopicRatingStats>

export async function updateTopicRatingStats(topicId: string): Promise<void> {
  await using query = await beginTransaction()
  await query(
    sql`/* lockTopicRatingStatsRefresh */ SELECT pg_advisory_xact_lock(hashtextextended(${`topic-rating:${topicId}`}, 0))`,
  )
  const [calculatedStats, currentStats] = await Promise.all([
    calculateTopicRatingStats(query, topicId),
    getCurrentTopicRatingStats(query, topicId),
  ])
  const changed = hasRatingStatsChanged(currentStats, calculatedStats)
  if (changed) await upsertTopicRatingStats(query, topicId, calculatedStats)
  await query.commit()

  if (changed) await enqueueBulkRefreshTopicMetricsById([topicId])
}

async function calculateTopicRatingStats(
  query: TransactionQuery,
  topicId: string,
): Promise<TopicRatingStats> {
  const result = await write(
    sql`/* calculateTopicRatingStats */
    WITH latest_reviews AS (
      SELECT DISTINCT ON (posts.created_by_id)
        posts.created_by_id,
        prtr.rating
      FROM post_review_topic_ratings prtr
      JOIN posts ON posts.id = prtr.post_id
      JOIN view_public_post_eligibility eligibility ON eligibility.post_id = posts.id
      WHERE prtr.topic_id = ${topicId}
      ORDER BY posts.created_by_id, posts.id DESC
    ),
    topic_vote_signals AS (
      SELECT DISTINCT ON (tev.user_id) tev.user_id, tev.score, tev.score_is_neutral, tev.score_is_semantic
      FROM topic_votes tev
      WHERE tev.topic_id = ${topicId}
      ORDER BY tev.user_id, tev.id DESC
    ),
    effective_signals AS (
      SELECT
        COALESCE(latest_reviews.created_by_id, topic_vote_signals.user_id) AS user_id,
        latest_reviews.rating AS review_rating,
        CASE
          WHEN latest_reviews.rating IS NOT NULL AND latest_reviews.rating != 3 THEN latest_reviews.rating
          WHEN topic_vote_signals.score IS NOT NULL
            AND (topic_vote_signals.score <> 0 OR topic_vote_signals.score_is_neutral)
            THEN (CASE
              WHEN topic_vote_signals.score = 1 AND NOT topic_vote_signals.score_is_semantic THEN 2
              WHEN topic_vote_signals.score = -1 AND NOT topic_vote_signals.score_is_semantic THEN -2
              ELSE topic_vote_signals.score
            END) + 3
          WHEN latest_reviews.rating IS NOT NULL THEN latest_reviews.rating
          ELSE NULL
        END AS effective_rating
      FROM latest_reviews
      FULL OUTER JOIN topic_vote_signals
        ON topic_vote_signals.user_id = latest_reviews.created_by_id
    )
    SELECT
      COALESCE(SUM(CASE WHEN effective_rating = 1 THEN users.vote_weight ELSE 0 END), 0)::DOUBLE PRECISION AS ratings__score__1,
      COALESCE(SUM(CASE WHEN effective_rating = 2 THEN users.vote_weight ELSE 0 END), 0)::DOUBLE PRECISION AS ratings__score__2,
      COALESCE(SUM(CASE WHEN effective_rating = 3 THEN users.vote_weight ELSE 0 END), 0)::DOUBLE PRECISION AS ratings__score__3,
      COALESCE(SUM(CASE WHEN effective_rating = 4 THEN users.vote_weight ELSE 0 END), 0)::DOUBLE PRECISION AS ratings__score__4,
      COALESCE(SUM(CASE WHEN effective_rating = 5 THEN users.vote_weight ELSE 0 END), 0)::DOUBLE PRECISION AS ratings__score__5,
      COUNT(*) FILTER (WHERE review_rating = 1)::BIGINT AS ratings__count__1,
      COUNT(*) FILTER (WHERE review_rating = 2)::BIGINT AS ratings__count__2,
      COUNT(*) FILTER (WHERE review_rating = 3)::BIGINT AS ratings__count__3,
      COUNT(*) FILTER (WHERE review_rating = 4)::BIGINT AS ratings__count__4,
      COUNT(*) FILTER (WHERE review_rating = 5)::BIGINT AS ratings__count__5
    FROM effective_signals
    JOIN users ON users.id = effective_signals.user_id
      AND users.deleted_at IS NULL
    WHERE effective_rating IS NOT NULL OR review_rating IS NOT NULL
  `,
    { client: query.client },
  )

  return normalizeTopicRatingStats(result.rows[0])
}

async function getCurrentTopicRatingStats(
  query: TransactionQuery,
  topicId: string,
): Promise<TopicRatingStats | null> {
  const result = await write(
    sql`/* getCurrentTopicRatingStats */
    SELECT
      COALESCE(ratings__score__1, 0)::DOUBLE PRECISION AS ratings__score__1,
      COALESCE(ratings__score__2, 0)::DOUBLE PRECISION AS ratings__score__2,
      COALESCE(ratings__score__3, 0)::DOUBLE PRECISION AS ratings__score__3,
      COALESCE(ratings__score__4, 0)::DOUBLE PRECISION AS ratings__score__4,
      COALESCE(ratings__score__5, 0)::DOUBLE PRECISION AS ratings__score__5,
      COALESCE(ratings__count__1, 0)::INT AS ratings__count__1,
      COALESCE(ratings__count__2, 0)::INT AS ratings__count__2,
      COALESCE(ratings__count__3, 0)::INT AS ratings__count__3,
      COALESCE(ratings__count__4, 0)::INT AS ratings__count__4,
      COALESCE(ratings__count__5, 0)::INT AS ratings__count__5
    FROM topic_metrics
    WHERE topic_id = ${topicId}
  `,
    { client: query.client },
  )

  const row = result.rows[0]
  if (!row) return null

  return normalizeTopicRatingStats(row)
}

function hasRatingStatsChanged(
  current: TopicRatingStats | null,
  calculated: TopicRatingStats,
): boolean {
  if (!current) return true

  const EPSILON = 0.001 // tolerance for floating-point comparison

  return ratingStatsKeys.some(key => {
    const currentValue = current[key]
    const calculatedValue = calculated[key]

    if (key.startsWith('ratings__score__'))
      return Math.abs(currentValue - calculatedValue) > EPSILON
    return currentValue !== calculatedValue
  })
}

async function upsertTopicRatingStats(
  query: TransactionQuery,
  topicId: string,
  stats: TopicRatingStats,
): Promise<void> {
  await write(
    sql`/* upsertTopicRatingStats */
    INSERT INTO topic_metrics (
      topic_id,
      ratings__score__1,
      ratings__score__2,
      ratings__score__3,
      ratings__score__4,
      ratings__score__5,
      ratings__count__1,
      ratings__count__2,
      ratings__count__3,
      ratings__count__4,
      ratings__count__5,
      ratings__updated_at
    )
    VALUES (
      ${topicId},
      ${stats.ratings__score__1},
      ${stats.ratings__score__2},
      ${stats.ratings__score__3},
      ${stats.ratings__score__4},
      ${stats.ratings__score__5},
      ${stats.ratings__count__1},
      ${stats.ratings__count__2},
      ${stats.ratings__count__3},
      ${stats.ratings__count__4},
      ${stats.ratings__count__5},
      CURRENT_TIMESTAMP
    )
    ON CONFLICT (topic_id) DO UPDATE SET
      ratings__score__1 = EXCLUDED.ratings__score__1,
      ratings__score__2 = EXCLUDED.ratings__score__2,
      ratings__score__3 = EXCLUDED.ratings__score__3,
      ratings__score__4 = EXCLUDED.ratings__score__4,
      ratings__score__5 = EXCLUDED.ratings__score__5,
      ratings__count__1 = EXCLUDED.ratings__count__1,
      ratings__count__2 = EXCLUDED.ratings__count__2,
      ratings__count__3 = EXCLUDED.ratings__count__3,
      ratings__count__4 = EXCLUDED.ratings__count__4,
      ratings__count__5 = EXCLUDED.ratings__count__5,
      ratings__updated_at = EXCLUDED.ratings__updated_at
    RETURNING topic_id
  `,
    { client: query.client },
  )
}
