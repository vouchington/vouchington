CREATE OR REPLACE VIEW view_rss_feed_current_states AS
  SELECT
    id AS rss_feed_id,
    is_enabled,
    is_discoverable
  FROM rss_feeds
;
