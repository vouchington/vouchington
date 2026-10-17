-- Pre-launch aggregate for public platform statistics. Refresh on the shared psql schedule.
-- squawk-ignore ban-drop-view -- PostgreSQL cannot replace a materialized view in place.
DROP MATERIALIZED VIEW IF EXISTS mv_platform_stats;

CREATE MATERIALIZED VIEW mv_platform_stats AS
WITH post_counts AS (
  SELECT COUNT(*)::INTEGER AS post_count,
    COUNT(*) FILTER (WHERE post_type = 'review')::INTEGER AS review_count,
    COUNT(*) FILTER (WHERE post_type = 'data_point')::INTEGER AS data_point_count
  FROM view_public_post_eligibility
)
SELECT
  1 AS singleton_id,
  (SELECT COUNT(*)::INTEGER FROM topics
   WHERE deleted_at IS NULL AND merged_into_topic_id IS NULL) AS topic_count,
  (SELECT COUNT(*)::INTEGER FROM rss_feeds
   WHERE deleted_at IS NULL AND is_enabled = TRUE) AS rss_feed_count,
  post_counts.post_count,
  post_counts.review_count,
  post_counts.data_point_count,
  (SELECT COUNT(*)::INTEGER FROM url_hostnames
   WHERE votes_count_up > 0 AND NOT is_blocked) AS hostname_count
FROM post_counts;

CREATE UNIQUE INDEX idx_mv_platform_stats__singleton_id ON mv_platform_stats (singleton_id);
COMMENT ON MATERIALIZED VIEW mv_platform_stats IS 'Cached public platform counts, refreshed on the PostgreSQL materialized-view schedule.';
