CREATE INDEX IF NOT EXISTS idx_rss_feed_items__story_id__deleted_at__id
  ON ONLY rss_feed_items (story_id, deleted_at, id)
  WHERE story_id IS NOT NULL;

ALTER INDEX idx_rss_feed_items__story_id__deleted_at__id
  ATTACH PARTITION rss_feed_items_default_story_id_deleted_at_id_idx;

-- Fail closed before retiring the RI index if an operator has added another partition.
DO $$
BEGIN
  IF NOT (SELECT indisvalid FROM pg_index
    WHERE indexrelid = 'idx_rss_feed_items__story_id__deleted_at__id'::regclass) THEN
    RAISE EXCEPTION 'Every RSS item partition needs the ordered story index before retirement';
  END IF;
END;
$$;

DROP INDEX IF EXISTS idx_rss_feed_items__story_id__ri;
