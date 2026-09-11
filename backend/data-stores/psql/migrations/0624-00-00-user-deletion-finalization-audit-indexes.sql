-- migration-mode: online

-- Finalization selects each cleanup page by request, terminal state, and UUIDv7 order.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_deletion_external_works__completed_audit
  ON user_deletion_external_works (request_id, id)
  WHERE completed_at IS NOT NULL
    AND work_key <> ('redacted:' || id::text);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_deletion_relation_impacts__recomputed_audit
  ON user_deletion_relation_impacts (request_id, id)
  WHERE recomputed_at IS NOT NULL;
