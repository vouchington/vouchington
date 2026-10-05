-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TABLE IF NOT EXISTS post_publication_reconciliation_audit_cursors (
  is_singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (is_singleton),
  cursor_post_id UUID,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TABLE IF NOT EXISTS post_publication_projection_receipts (
  post_identity_id UUID NOT NULL,
  eligibility_fingerprint TEXT NOT NULL,
  applied_generation BIGINT NOT NULL CHECK (applied_generation > 0),
  applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  applied_snapshot_id UUID NOT NULL,
  PRIMARY KEY (post_identity_id)
) PARTITION BY RANGE (post_identity_id);

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE OR REPLACE TRIGGER trg_post_publication_reconciliation_audit_cursors__updated_at
BEFORE UPDATE ON post_publication_reconciliation_audit_cursors
FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();

COMMENT ON TABLE post_publication_reconciliation_audit_cursors IS 'Durable UUID-cursor checkpoints for bounded operator publication shadow scans and repairs.';
COMMENT ON COLUMN post_publication_reconciliation_audit_cursors.is_singleton IS 'One durable cursor for the bounded operator publication audit.';
COMMENT ON COLUMN post_publication_reconciliation_audit_cursors.cursor_post_id IS 'Last post UUID inspected by this audit; no FK preserves progress if the row is deleted.';
COMMENT ON TABLE post_publication_projection_receipts IS 'Durable current-state receipt for cache, rating and sitemap projections owned by post-publication reconciliation.';
COMMENT ON COLUMN post_publication_projection_receipts.post_identity_id IS 'Concrete durable post identity FK; live post access follows the bridge post_id FK.';
COMMENT ON COLUMN post_publication_projection_receipts.eligibility_fingerprint IS 'Canonical primary-state publication eligibility fingerprint applied by the worker.';
COMMENT ON COLUMN post_publication_projection_receipts.applied_generation IS 'Dirty-work generation whose owned projections produced this receipt.';
COMMENT ON COLUMN post_publication_projection_receipts.applied_at IS 'Timestamp when the recorded projection identity was last applied successfully.';
COMMENT ON COLUMN post_publication_projection_receipts.applied_snapshot_id IS 'Complete snapshot accepted after projection effects; required for every receipt.';
