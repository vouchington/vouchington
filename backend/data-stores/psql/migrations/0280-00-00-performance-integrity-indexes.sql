-- Coalesced pre-launch domain baseline.
-- Merged from: 0420-00-00-postgres-performance-integrity.sql

CREATE INDEX IF NOT EXISTS idx_post_feed_shares__sharer__post__id_desc
  ON post_feed_shares (shared_by_user_id, post_id, id DESC);

CREATE INDEX IF NOT EXISTS idx_rss_item_feed_shares__sharer__item__id_desc
  ON rss_feed_item_feed_shares (shared_by_user_id, rss_feed_item_id, id DESC);
