-- migration-mode: online

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_copyright_notices__received_id
  ON copyright_notices (received_at, id);
