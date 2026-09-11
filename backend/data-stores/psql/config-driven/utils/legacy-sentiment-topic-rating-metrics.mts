export function rebuildLegacySentimentTopicRatingMetricsSql(): string {
  return `  WITH affected_topic_ids AS (
    SELECT DISTINCT topic_id FROM topic_votes
    WHERE (score = 0 AND NOT score_is_neutral) OR (score IN (-1, 1) AND NOT score_is_semantic)
  ), latest_reviews AS (
    SELECT DISTINCT ON (prtr.topic_id, posts.created_by_id)
      prtr.topic_id, posts.created_by_id, prtr.rating
    FROM post_review_topic_ratings prtr
    JOIN posts ON posts.id = prtr.post_id AND posts.deleted_at IS NULL AND posts.archived_at IS NULL
    JOIN affected_topic_ids ON affected_topic_ids.topic_id = prtr.topic_id
    ORDER BY prtr.topic_id, posts.created_by_id, posts.id DESC
  ), topic_vote_signals AS (
    SELECT DISTINCT ON (topic_votes.topic_id, topic_votes.user_id)
      topic_votes.topic_id, topic_votes.user_id, topic_votes.score, topic_votes.score_is_neutral,
      topic_votes.score_is_semantic
    FROM topic_votes
    JOIN affected_topic_ids ON affected_topic_ids.topic_id = topic_votes.topic_id
    ORDER BY topic_votes.topic_id, topic_votes.user_id, topic_votes.id DESC
  ), effective_signals AS (
    SELECT COALESCE(latest_reviews.topic_id, topic_vote_signals.topic_id) AS topic_id,
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
      ON topic_vote_signals.topic_id = latest_reviews.topic_id
      AND topic_vote_signals.user_id = latest_reviews.created_by_id
  ), calculated_stats AS (
    SELECT affected_topic_ids.topic_id,
      COALESCE(SUM(CASE WHEN effective_rating = 1 AND users.id IS NOT NULL THEN users.vote_weight ELSE 0 END), 0)::DOUBLE PRECISION AS ratings__score__1,
      COALESCE(SUM(CASE WHEN effective_rating = 2 AND users.id IS NOT NULL THEN users.vote_weight ELSE 0 END), 0)::DOUBLE PRECISION AS ratings__score__2,
      COALESCE(SUM(CASE WHEN effective_rating = 3 AND users.id IS NOT NULL THEN users.vote_weight ELSE 0 END), 0)::DOUBLE PRECISION AS ratings__score__3,
      COALESCE(SUM(CASE WHEN effective_rating = 4 AND users.id IS NOT NULL THEN users.vote_weight ELSE 0 END), 0)::DOUBLE PRECISION AS ratings__score__4,
      COALESCE(SUM(CASE WHEN effective_rating = 5 AND users.id IS NOT NULL THEN users.vote_weight ELSE 0 END), 0)::DOUBLE PRECISION AS ratings__score__5,
      COUNT(*) FILTER (WHERE review_rating = 1 AND users.id IS NOT NULL)::INT AS ratings__count__1,
      COUNT(*) FILTER (WHERE review_rating = 2 AND users.id IS NOT NULL)::INT AS ratings__count__2,
      COUNT(*) FILTER (WHERE review_rating = 3 AND users.id IS NOT NULL)::INT AS ratings__count__3,
      COUNT(*) FILTER (WHERE review_rating = 4 AND users.id IS NOT NULL)::INT AS ratings__count__4,
      COUNT(*) FILTER (WHERE review_rating = 5 AND users.id IS NOT NULL)::INT AS ratings__count__5
    FROM affected_topic_ids
    LEFT JOIN effective_signals ON effective_signals.topic_id = affected_topic_ids.topic_id
    LEFT JOIN users ON users.id = effective_signals.user_id AND users.deleted_at IS NULL
    GROUP BY affected_topic_ids.topic_id
  )
  INSERT INTO topic_metrics (
    topic_id, ratings__score__1, ratings__score__2, ratings__score__3, ratings__score__4, ratings__score__5,
    ratings__count__1, ratings__count__2, ratings__count__3, ratings__count__4, ratings__count__5, ratings__updated_at
  )
  SELECT topic_id, ratings__score__1, ratings__score__2, ratings__score__3, ratings__score__4, ratings__score__5,
    ratings__count__1, ratings__count__2, ratings__count__3, ratings__count__4, ratings__count__5, CURRENT_TIMESTAMP
  FROM calculated_stats
  ORDER BY topic_id
  ON CONFLICT (topic_id) DO UPDATE SET
    ratings__score__1 = EXCLUDED.ratings__score__1, ratings__score__2 = EXCLUDED.ratings__score__2,
    ratings__score__3 = EXCLUDED.ratings__score__3, ratings__score__4 = EXCLUDED.ratings__score__4,
    ratings__score__5 = EXCLUDED.ratings__score__5, ratings__count__1 = EXCLUDED.ratings__count__1,
    ratings__count__2 = EXCLUDED.ratings__count__2, ratings__count__3 = EXCLUDED.ratings__count__3,
    ratings__count__4 = EXCLUDED.ratings__count__4, ratings__count__5 = EXCLUDED.ratings__count__5,
    ratings__updated_at = EXCLUDED.ratings__updated_at
  WHERE topic_metrics.ratings__score__1 IS DISTINCT FROM EXCLUDED.ratings__score__1
     OR topic_metrics.ratings__score__2 IS DISTINCT FROM EXCLUDED.ratings__score__2
     OR topic_metrics.ratings__score__3 IS DISTINCT FROM EXCLUDED.ratings__score__3
     OR topic_metrics.ratings__score__4 IS DISTINCT FROM EXCLUDED.ratings__score__4
     OR topic_metrics.ratings__score__5 IS DISTINCT FROM EXCLUDED.ratings__score__5
     OR topic_metrics.ratings__count__1 IS DISTINCT FROM EXCLUDED.ratings__count__1
     OR topic_metrics.ratings__count__2 IS DISTINCT FROM EXCLUDED.ratings__count__2
     OR topic_metrics.ratings__count__3 IS DISTINCT FROM EXCLUDED.ratings__count__3
     OR topic_metrics.ratings__count__4 IS DISTINCT FROM EXCLUDED.ratings__count__4
     OR topic_metrics.ratings__count__5 IS DISTINCT FROM EXCLUDED.ratings__count__5;`
}
