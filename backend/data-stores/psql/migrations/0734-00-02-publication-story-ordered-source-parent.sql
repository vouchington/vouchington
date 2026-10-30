-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX IF NOT EXISTS idx_rss_feed_items__story_id__deleted_at__id
  ON ONLY rss_feed_items (story_id, deleted_at, id)
  WHERE story_id IS NOT NULL;

ALTER INDEX idx_rss_feed_items__story_id__deleted_at__id
  ATTACH PARTITION rss_feed_items_default_story_id_deleted_at_id_idx;
