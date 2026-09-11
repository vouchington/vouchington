-- migration-mode: online
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ap_inbox_deliveries__unverified_retention
  ON ap_inbox_deliveries (retention_expires_at, id)
  WHERE verified_at IS NULL AND retention_expires_at IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ap_inbox_deliveries__verified_retention
  ON ap_inbox_deliveries (retention_expires_at, id)
  WHERE verified_at IS NOT NULL AND retention_expires_at IS NOT NULL;
