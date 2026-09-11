ALTER TABLE rss_feed_item_sources
  ADD COLUMN published_at TIMESTAMPTZ;

COMMENT ON COLUMN rss_feed_item_sources.published_at IS
  'Publication timestamp captured when this feed-to-item association is first observed. Production ingestion applies the item UUIDv7 clamp to this feed payload''s sanitized publication dates and preserves an existing association on conflict.';
