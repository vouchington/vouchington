CREATE TABLE IF NOT EXISTS post_publication_reconciliation_audit_checkpoints (
  checkpoint_name TEXT PRIMARY KEY,
  cursor_post_id UUID,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS post_publication_projection_receipts (
  post_id UUID NOT NULL,
  eligibility_fingerprint TEXT NOT NULL,
  applied_generation BIGINT NOT NULL CHECK (applied_generation > 0),
  applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  applied_identity JSONB NOT NULL DEFAULT '{"topicIds":[],"identityKeys":[],"sitemapTargets":[]}'::jsonb,
  PRIMARY KEY (post_id),
  CONSTRAINT chk_post_publication_projection_receipts_applied_identity_objec
    CHECK (jsonb_typeof(applied_identity) = 'object')
) PARTITION BY RANGE (post_id);

CREATE OR REPLACE TRIGGER trigger_post_pub_audit_checkpoints_updated_at
BEFORE UPDATE ON post_publication_reconciliation_audit_checkpoints
FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();

COMMENT ON TABLE post_publication_reconciliation_audit_checkpoints IS 'Durable UUID-cursor checkpoints for bounded operator publication shadow scans and repairs.';
COMMENT ON COLUMN post_publication_reconciliation_audit_checkpoints.checkpoint_name IS 'Stable name for one independently rerunnable operator scan.';
COMMENT ON COLUMN post_publication_reconciliation_audit_checkpoints.cursor_post_id IS 'Last post UUID inspected by this audit; no FK preserves progress if the row is deleted.';
COMMENT ON TABLE post_publication_projection_receipts IS 'Durable current-state receipt for cache, rating and sitemap projections owned by post-publication reconciliation.';
COMMENT ON COLUMN post_publication_projection_receipts.post_id IS 'Post identity retained without an FK so deletion remains auditable and repairable.';
COMMENT ON COLUMN post_publication_projection_receipts.eligibility_fingerprint IS 'Canonical primary-state publication eligibility fingerprint applied by the worker.';
COMMENT ON COLUMN post_publication_projection_receipts.applied_generation IS 'Dirty-work generation whose owned projections produced this receipt.';
COMMENT ON COLUMN post_publication_projection_receipts.applied_at IS 'Timestamp when the recorded projection identity was last applied successfully.';
COMMENT ON COLUMN post_publication_projection_receipts.applied_identity IS 'Exact projection identities last applied by reconciliation, retained for compensating shadow repair.';
