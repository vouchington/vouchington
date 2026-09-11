CREATE TABLE IF NOT EXISTS queue_reconciliation_checkpoints (
  queue_name TEXT PRIMARY KEY,
  completed_through TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (queue_name = TRIM(queue_name) AND char_length(queue_name) BETWEEN 1 AND 100)
);

CREATE OR REPLACE TRIGGER trigger_queue_reconciliation_checkpoints_updated_at
BEFORE UPDATE ON queue_reconciliation_checkpoints
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

COMMENT ON TABLE queue_reconciliation_checkpoints IS 'Durable high-water marks advanced only after a reconciliation dispatcher processes every candidate.';
COMMENT ON COLUMN queue_reconciliation_checkpoints.queue_name IS 'Stable queue-domain identifier owning this high-water mark.';
COMMENT ON COLUMN queue_reconciliation_checkpoints.completed_through IS 'Latest source timestamp whose complete candidate set was successfully reconciled.';
