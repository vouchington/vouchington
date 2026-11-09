-- Rolling day, week and month tag scores per topic. Each relation table is read once over the
-- 30-day id range, then expanded into the windows it falls inside. Post tags weigh 5, RSS tags 1.
-- Deleted and merged topics are filtered by the read path so moderation applies immediately.
-- squawk-ignore ban-drop-view -- PostgreSQL cannot replace a materialized view in place.
DROP MATERIALIZED VIEW IF EXISTS mv_trending_topics;

CREATE MATERIALIZED VIEW mv_trending_topics AS
WITH windows AS (
  SELECT window_name, cutoff_id FROM (VALUES
    ('day'::TEXT, fn_min_uuidv7(CURRENT_TIMESTAMP - INTERVAL '1 day')),
    ('week'::TEXT, fn_min_uuidv7(CURRENT_TIMESTAMP - INTERVAL '7 days')),
    ('month'::TEXT, fn_min_uuidv7(CURRENT_TIMESTAMP - INTERVAL '30 days'))
  ) AS value(window_name, cutoff_id)
), recent_tags AS (
  SELECT relation.id, relation.object_id AS topic_id, TRUE AS is_post_tag
  FROM relation__post__category__topic relation
  WHERE relation.deleted_at IS NULL
    AND relation.votes_score_net > 0
    AND relation.id >= fn_min_uuidv7(CURRENT_TIMESTAMP - INTERVAL '30 days')
  UNION ALL
  SELECT relation.id, relation.object_id AS topic_id, FALSE AS is_post_tag
  FROM relation__rss_feed_item__category__topic relation
  WHERE relation.deleted_at IS NULL
    AND relation.votes_score_net > 0
    AND relation.id >= fn_min_uuidv7(CURRENT_TIMESTAMP - INTERVAL '30 days')
)
SELECT
  windows.window_name,
  tag.topic_id AS id,
  (COUNT(*) FILTER (WHERE tag.is_post_tag) * 5 + COUNT(*) FILTER (WHERE NOT tag.is_post_tag))::DOUBLE PRECISION AS trending_score,
  (COUNT(*) FILTER (WHERE tag.is_post_tag))::INT AS post_tag_count,
  (COUNT(*) FILTER (WHERE NOT tag.is_post_tag))::INT AS rss_item_tag_count
FROM windows
JOIN recent_tags tag ON tag.id >= windows.cutoff_id
GROUP BY windows.window_name, tag.topic_id;

CREATE UNIQUE INDEX idx_mv_trending_topics__window_id ON mv_trending_topics (window_name, id);
CREATE INDEX idx_mv_trending_topics__ranking
  ON mv_trending_topics (window_name, trending_score DESC, id DESC);
COMMENT ON MATERIALIZED VIEW mv_trending_topics IS 'Rolling day, week and month topic tag scores from positively voted post and RSS item tags, refreshed on the PostgreSQL materialized-view schedule.';
