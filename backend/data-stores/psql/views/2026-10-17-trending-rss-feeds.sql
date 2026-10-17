-- Three fixed rolling windows preserve the API's day/week/month score and cursor contract.
-- squawk-ignore ban-drop-view -- PostgreSQL cannot replace a materialized view in place.
DROP MATERIALIZED VIEW IF EXISTS mv_trending_rss_feeds;

CREATE MATERIALIZED VIEW mv_trending_rss_feeds AS
WITH windows AS (
  SELECT window_name, days
  FROM (VALUES ('day'::TEXT, 1), ('week'::TEXT, 7), ('month'::TEXT, 30)) AS value(window_name, days)
), recent_follows AS (
  SELECT windows.window_name, relation.object_id AS feed_id, COUNT(*)::INT AS follow_count
  FROM windows
  JOIN relation__user__follow__rss_feed relation
    ON relation.deleted_at IS NULL
   AND relation.created_at > CURRENT_TIMESTAMP - windows.days * INTERVAL '1 day'
  GROUP BY windows.window_name, relation.object_id
), recent_items AS (
  SELECT windows.window_name, source.rss_feed_id AS feed_id, COUNT(*)::INT AS item_count
  FROM windows
  JOIN rss_feed_items item
    ON item.deleted_at IS NULL
   AND item.published_at > CURRENT_TIMESTAMP - windows.days * INTERVAL '1 day'
  JOIN rss_feed_item_sources source ON source.rss_feed_item_id = item.id
  GROUP BY windows.window_name, source.rss_feed_id
)
SELECT
  windows.window_name,
  feed.id,
  (COALESCE(follows.follow_count, 0) * 3.0 + COALESCE(items.item_count, 0))::DOUBLE PRECISION AS trending_score,
  COALESCE(follows.follow_count, 0)::INT AS follow_count,
  COALESCE(items.item_count, 0)::INT AS item_count
FROM windows
JOIN rss_feeds feed ON feed.deleted_at IS NULL
  AND feed.is_enabled = TRUE AND feed.is_discoverable = TRUE
LEFT JOIN recent_follows follows
  ON follows.window_name = windows.window_name AND follows.feed_id = feed.id
LEFT JOIN recent_items items
  ON items.window_name = windows.window_name AND items.feed_id = feed.id
WHERE follows.feed_id IS NOT NULL OR items.feed_id IS NOT NULL;

CREATE UNIQUE INDEX idx_mv_trending_rss_feeds__window_id ON mv_trending_rss_feeds (window_name, id);
CREATE INDEX idx_mv_trending_rss_feeds__ranking
  ON mv_trending_rss_feeds (window_name, trending_score DESC, id DESC);
COMMENT ON MATERIALIZED VIEW mv_trending_rss_feeds IS 'Rolling feed scores for day, week and month, refreshed on the PostgreSQL materialized-view schedule.';
