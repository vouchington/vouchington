-- migration-mode: online

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_posts__default__created_by_rejected_at_id
  ON posts__default (created_by_id, rejected_at DESC, id DESC)
  WHERE rejected_at IS NOT NULL AND deleted_at IS NULL;
