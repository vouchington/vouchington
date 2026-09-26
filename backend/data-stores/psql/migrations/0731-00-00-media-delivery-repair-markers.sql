-- A committed marker survives the deliberately pre-commit edge denial and lets the existing
-- registry reconciler repair the authoritative tuple after an interrupted owner transaction.
CREATE TABLE media_delivery_repair_markers (
  delivery_key text PRIMARY KEY CHECK (char_length(delivery_key) BETWEEN 1 AND 512),
  marker_token bigint NOT NULL,
  route_kind text NOT NULL CHECK (route_kind IN ('placement', 'legacy-image')),
  placement_id uuid,
  placement_revision integer CHECK (placement_revision IS NULL OR placement_revision >= 0),
  asset_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK ((route_kind = 'placement' AND placement_id IS NOT NULL AND placement_revision IS NOT NULL)
    OR (route_kind = 'legacy-image' AND placement_id IS NULL AND placement_revision IS NULL))
);

CREATE INDEX idx_media_delivery_repair_markers__oldest
  ON media_delivery_repair_markers (created_at, delivery_key);

COMMENT ON TABLE media_delivery_repair_markers IS
  'FK-free committed repair intent for a successful pre-commit edge denial; drained by the existing media delivery reconciler.';
COMMENT ON COLUMN media_delivery_repair_markers.delivery_key IS 'Exact immutable delivery URL identity; coalesces outstanding repair work.';
COMMENT ON COLUMN media_delivery_repair_markers.marker_token IS 'Monotonic wakeup identity allocated on coalescing; acknowledgement deletes only its observed token.';
COMMENT ON COLUMN media_delivery_repair_markers.route_kind IS 'Typed placement or legacy-image URL namespace.';
COMMENT ON COLUMN media_delivery_repair_markers.placement_id IS 'Placement snapshot without an FK so repair survives owner rollback and never-committed placements.';
COMMENT ON COLUMN media_delivery_repair_markers.placement_revision IS 'Exact immutable URL revision captured before denial.';
COMMENT ON COLUMN media_delivery_repair_markers.asset_id IS 'Image snapshot without an FK so repair survives owner rollback and never-committed images.';
