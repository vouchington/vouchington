-- migration-mode: online

CREATE INDEX CONCURRENTLY IF NOT EXISTS rss_feed_items_default_story_id_id_url_id_idx
  ON rss_feed_items_default (story_id, id) INCLUDE (url_id)
  WHERE story_id IS NOT NULL AND deleted_at IS NULL;
