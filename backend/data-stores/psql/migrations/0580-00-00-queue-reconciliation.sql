-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TABLE IF NOT EXISTS entity_listener_reconciliation_cursors (
  is_singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (is_singleton),
  reconciled_through_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE OR REPLACE TRIGGER trg_entity_listener_reconciliation_cursors__updated_at
BEFORE UPDATE ON entity_listener_reconciliation_cursors
FOR EACH ROW
EXECUTE FUNCTION fn_update_updated_at();

CREATE INDEX IF NOT EXISTS idx_users__updated_at_id_active
ON users (updated_at, id) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_topics__updated_at_id_active
ON topics (updated_at, id) WHERE deleted_at IS NULL AND merged_into_topic_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_images__updated_at_id_active
ON images (updated_at, id) WHERE deleted_at IS NULL AND upload_completed_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_urls__updated_at_id_active
ON urls (updated_at, id);

COMMENT ON TABLE entity_listener_reconciliation_cursors IS 'Durable high-water marks advanced only after a reconciliation dispatcher processes every candidate.';
COMMENT ON COLUMN entity_listener_reconciliation_cursors.is_singleton IS 'One dispatcher owns the forward-only source timestamp high-water mark.';
COMMENT ON COLUMN entity_listener_reconciliation_cursors.reconciled_through_at IS 'Latest source timestamp whose complete candidate set was successfully reconciled.';
