CREATE INDEX IF NOT EXISTS idx_posts__created_by_rejected_at_id
  ON ONLY posts (created_by_id, rejected_at DESC, id DESC)
  WHERE rejected_at IS NOT NULL AND deleted_at IS NULL;

ALTER INDEX idx_posts__created_by_rejected_at_id
  ATTACH PARTITION idx_posts__default__created_by_rejected_at_id;
