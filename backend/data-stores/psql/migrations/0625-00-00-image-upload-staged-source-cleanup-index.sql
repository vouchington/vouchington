-- migration-mode: online

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_images__staged_source_cleanup
  ON images (upload_staged_at, id)
  WHERE upload_staged_at IS NOT NULL
    AND upload_source_deleted_at IS NULL;
