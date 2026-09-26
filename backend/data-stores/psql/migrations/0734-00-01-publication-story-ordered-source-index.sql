-- migration-mode: online

CREATE INDEX CONCURRENTLY IF NOT EXISTS rss_feed_items_default_story_id_deleted_at_id_idx
  ON rss_feed_items_default (story_id, deleted_at, id)
  WHERE story_id IS NOT NULL;
