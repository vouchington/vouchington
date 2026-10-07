-- A committed marker survives the deliberately pre-commit edge denial and lets the existing
-- registry reconciler repair the authoritative tuple after an interrupted owner transaction.
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TABLE media_delivery_repair_markers (
  delivery_key text PRIMARY KEY REFERENCES media_delivery_registry_records(delivery_key) ON DELETE RESTRICT,
  marker_token bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE OR REPLACE TRIGGER trigger_media_delivery_repair_markers_updated_at
BEFORE UPDATE ON media_delivery_repair_markers
FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();

CREATE INDEX idx_media_delivery_repair_markers__oldest
  ON media_delivery_repair_markers (created_at, delivery_key);

COMMENT ON TABLE media_delivery_repair_markers IS
  'Committed registry-backed wakeup for pre-commit edge denial recovery; drained by the existing media delivery reconciler.';
COMMENT ON COLUMN media_delivery_repair_markers.delivery_key IS 'Exact immutable delivery URL identity; coalesces outstanding repair work.';
COMMENT ON COLUMN media_delivery_repair_markers.marker_token IS 'Monotonic wakeup identity allocated on coalescing; acknowledgement deletes only its observed token.';
