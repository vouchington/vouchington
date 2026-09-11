CREATE INDEX IF NOT EXISTS idx_rss_feed_items__story_id__id__url_id
  ON ONLY rss_feed_items (story_id, id) INCLUDE (url_id)
  WHERE story_id IS NOT NULL AND deleted_at IS NULL;

ALTER INDEX idx_rss_feed_items__story_id__id__url_id
  ATTACH PARTITION rss_feed_items_default_story_id_id_url_id_idx;

DROP INDEX IF EXISTS idx_rss_feed_items__story_id;
