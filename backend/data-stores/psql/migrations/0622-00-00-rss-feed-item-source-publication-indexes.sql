-- migration-mode: online

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_rss_feed_item_sources__feed_published_item
  ON rss_feed_item_sources (rss_feed_id, published_at DESC, rss_feed_item_id DESC)
  WHERE published_at IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_rss_feed_item_sources__missing_published_at
  ON rss_feed_item_sources (rss_feed_id, rss_feed_item_id)
  WHERE published_at IS NULL;
