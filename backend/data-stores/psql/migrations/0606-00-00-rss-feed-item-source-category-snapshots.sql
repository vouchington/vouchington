-- Source-owned RSS category snapshots retain each feed's complete view of a shared item.
-- The reconciliation outbox consumes their union, so one feed cannot remove another feed's labels.
CREATE TABLE IF NOT EXISTS rss_feed_item_source_category_snapshots (
  rss_feed_id UUID NOT NULL,
  rss_feed_item_id UUID NOT NULL,
  categories JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (rss_feed_id, rss_feed_item_id),
  FOREIGN KEY (rss_feed_id, rss_feed_item_id)
    REFERENCES rss_feed_item_sources (rss_feed_id, rss_feed_item_id) ON DELETE CASCADE,
  CHECK (jsonb_typeof(categories) = 'array')
);

CREATE INDEX IF NOT EXISTS idx_rss_feed_item_source_category_snapshots__item_feed
ON rss_feed_item_source_category_snapshots (rss_feed_item_id, rss_feed_id);

-- Existing category projections predate source provenance. Seed every current source with the
-- current union so deployment cannot remove a category before that source next supplies its own
-- complete snapshot.
INSERT INTO rss_feed_item_source_category_snapshots (rss_feed_id, rss_feed_item_id, categories)
SELECT source.rss_feed_id,
       source.rss_feed_item_id,
       COALESCE(
         jsonb_agg(category.category_text ORDER BY category.category_text)
           FILTER (WHERE category.category_text IS NOT NULL),
         '[]'::jsonb
       )
FROM rss_feed_item_sources source
LEFT JOIN rss_feed_item_categories category ON category.rss_feed_item_id = source.rss_feed_item_id
GROUP BY source.rss_feed_id, source.rss_feed_item_id
ON CONFLICT (rss_feed_id, rss_feed_item_id) DO NOTHING;

COMMENT ON TABLE rss_feed_item_source_category_snapshots IS 'Complete normalized category snapshots owned by each RSS feed source for a shared item.';
COMMENT ON COLUMN rss_feed_item_source_category_snapshots.rss_feed_id IS 'RSS feed that supplied this category snapshot.';
COMMENT ON COLUMN rss_feed_item_source_category_snapshots.rss_feed_item_id IS 'Shared RSS feed item described by the source snapshot.';
COMMENT ON COLUMN rss_feed_item_source_category_snapshots.categories IS 'Normalized category strings supplied by this feed, including an empty array when the feed removed all categories.';
COMMENT ON COLUMN rss_feed_item_source_category_snapshots.updated_at IS 'When this source supplied its current complete category snapshot.';
