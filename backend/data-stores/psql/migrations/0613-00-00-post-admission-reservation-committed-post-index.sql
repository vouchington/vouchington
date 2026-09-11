-- migration-mode: online

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_post_admission_reservations__committed_post_retention
  ON post_admission_reservations (committed_post_id, retention_expires_at)
  WHERE state = 'committed';
