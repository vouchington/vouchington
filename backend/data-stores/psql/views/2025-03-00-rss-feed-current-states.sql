-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE OR REPLACE VIEW view_rss_feed_current_states AS
  SELECT
    id AS rss_feed_id,
    is_enabled,
    is_discoverable
  FROM rss_feeds
;

COMMENT ON VIEW view_rss_feed_current_states IS 'Current RSS discoverability settings derived from immutable setting changes.';
