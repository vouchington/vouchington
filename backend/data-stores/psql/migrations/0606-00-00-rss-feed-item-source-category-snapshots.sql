-- Source-owned RSS category snapshots retain each feed's complete view of a shared item.
-- The reconciliation outbox consumes their union, so one feed cannot remove another feed's labels.
CREATE TABLE IF NOT EXISTS rss_feed_item_source_category_snapshots (
  rss_feed_id UUID NOT NULL,
  rss_feed_item_id UUID NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (rss_feed_id, rss_feed_item_id),
  FOREIGN KEY (rss_feed_id, rss_feed_item_id)
    REFERENCES rss_feed_item_sources (rss_feed_id, rss_feed_item_id) ON DELETE CASCADE
);

-- Zero child rows mean this feed explicitly supplied an empty category snapshot.
-- Absence of the parent row means this feed has not supplied a snapshot.
CREATE TABLE IF NOT EXISTS rss_feed_item_source_category_snapshot_categories (
  rss_feed_id UUID NOT NULL,
  rss_feed_item_id UUID NOT NULL,
  ordinal INT NOT NULL CHECK (ordinal >= 0),
  category_text TEXT NOT NULL CHECK (char_length(category_text) BETWEEN 1 AND 4096),
  PRIMARY KEY (rss_feed_id, rss_feed_item_id, ordinal),
  FOREIGN KEY (rss_feed_id, rss_feed_item_id)
    REFERENCES rss_feed_item_source_category_snapshots (rss_feed_id, rss_feed_item_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_rss_feed_item_source_category_snapshots__item_feed
ON rss_feed_item_source_category_snapshots (rss_feed_item_id, rss_feed_id);

COMMENT ON TABLE rss_feed_item_source_category_snapshots IS 'Complete normalized category snapshots owned by each RSS feed source for a shared item.';
COMMENT ON COLUMN rss_feed_item_source_category_snapshots.rss_feed_id IS 'RSS feed that supplied this category snapshot.';
COMMENT ON COLUMN rss_feed_item_source_category_snapshots.rss_feed_item_id IS 'Shared RSS feed item described by the source snapshot.';
COMMENT ON COLUMN rss_feed_item_source_category_snapshots.updated_at IS 'When this source supplied its current complete category snapshot.';
COMMENT ON TABLE rss_feed_item_source_category_snapshot_categories IS 'Ordered category strings for one feed-owned snapshot. No rows means an explicit empty snapshot.';
COMMENT ON COLUMN rss_feed_item_source_category_snapshot_categories.ordinal IS 'Zero-based position of this category in the feed snapshot.';
COMMENT ON COLUMN rss_feed_item_source_category_snapshot_categories.category_text IS 'Normalized category text supplied by this feed.';
