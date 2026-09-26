-- Breaking offline contraction: deploy placement-only edge rejection with all image-mutating
-- backends. No mixed-version compatibility. Preserve the sequence and exact placement work.
DELETE FROM media_delivery_registry_records WHERE route_kind <> 'placement';
DELETE FROM media_delivery_repair_markers WHERE route_kind <> 'placement';

ALTER TABLE media_delivery_registry_records
  DROP CONSTRAINT media_delivery_registry_records_check,
  -- squawk-ignore ban-drop-column -- Coordinated offline cutover removes all discriminator readers and writers.
  DROP COLUMN media_kind,
  -- squawk-ignore ban-drop-column -- Only image placement routes remain; mixed-version writers are unsupported.
  DROP COLUMN route_kind,
  -- squawk-ignore adding-not-nullable-field -- Offline contraction scans preserved placement rows; downtime is required.
  ALTER COLUMN placement_id SET NOT NULL,
  -- squawk-ignore adding-not-nullable-field -- Offline contraction scans preserved placement rows; downtime is required.
  ALTER COLUMN placement_revision SET NOT NULL;
-- squawk-ignore renaming-column -- All image-mutating backends cut over together; no runtime alias is retained.
ALTER TABLE media_delivery_registry_records RENAME COLUMN asset_id TO image_id;
DROP INDEX idx_media_delivery_registry_records__asset;
CREATE INDEX idx_media_delivery_registry_records__image ON media_delivery_registry_records (image_id);
ALTER TABLE media_delivery_registry_records RENAME CONSTRAINT media_delivery_registry_records_asset_id_fkey TO media_delivery_registry_records_image_id_fkey;
ALTER TABLE media_delivery_registry_records ADD CONSTRAINT media_delivery_registry_records_exact_key
  CHECK (delivery_key = concat('image-placement:', placement_id, ':', placement_revision, ':', image_id)) NOT VALID;
ALTER TABLE media_delivery_registry_records VALIDATE CONSTRAINT media_delivery_registry_records_exact_key;

ALTER TABLE media_delivery_repair_markers
  -- squawk-ignore ban-drop-column -- Only canonical exact-key recovery remains after the offline cutover.
  DROP COLUMN route_kind,
  -- squawk-ignore ban-drop-column -- Key-only wakeups must not snapshot a potentially uncommitted placement parent.
  DROP COLUMN placement_id,
  -- squawk-ignore ban-drop-column -- The immutable revision is parsed from the exact canonical URL key.
  DROP COLUMN placement_revision,
  -- squawk-ignore ban-drop-column -- Key-only wakeups derive image authority from committed immutable bindings.
  DROP COLUMN asset_id;
ALTER TABLE media_delivery_repair_markers ADD CONSTRAINT media_delivery_repair_markers_exact_key
  CHECK (CASE WHEN delivery_key ~ '^image-placement:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:(0|[1-9][0-9]{0,9}):[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    THEN split_part(delivery_key, ':', 3)::bigint <= 2147483647 ELSE FALSE END) NOT VALID;
ALTER TABLE media_delivery_repair_markers VALIDATE CONSTRAINT media_delivery_repair_markers_exact_key;

-- squawk-ignore ban-drop-column -- Image-only placement authority removes the unused speculative discriminator in this offline cutover.
ALTER TABLE media_placements DROP COLUMN placement_kind;
COMMENT ON TABLE media_placements IS 'Durable image-use placements; exact binding and revision authority governs public delivery.';
COMMENT ON TABLE media_delivery_registry_records IS 'Durable exact image-placement delivery outbox; image and placement parents are retained.';
COMMENT ON COLUMN media_delivery_registry_records.delivery_key IS 'Exact canonical image-placement:<placement UUID>:<revision>:<image UUID> URL identity.';
COMMENT ON COLUMN media_delivery_registry_records.placement_id IS 'Typed placement authority; never inferred from image existence.';
COMMENT ON COLUMN media_delivery_registry_records.image_id IS 'Immutable image bound to the exact public-use placement.';
COMMENT ON TABLE media_delivery_repair_markers IS 'FK-free exact-key wakeups for rollback/crash recovery; committed typed authority is re-read under the placement fence.';

CREATE OR REPLACE FUNCTION fn_guard_media_placement()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'media placements are retained for legal revision fencing' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.revision <> OLD.revision + 1 THEN
    RAISE EXCEPTION 'media placement revision must advance by exactly one' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.retired_at IS NOT DISTINCT FROM OLD.retired_at
    AND NEW.retirement_reason IS NOT DISTINCT FROM OLD.retirement_reason
    AND NEW.copyright_withheld_at IS NOT DISTINCT FROM OLD.copyright_withheld_at THEN
    RAISE EXCEPTION 'media placement lifecycle update must change availability' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION fn_sync_image_surface_placement(
  p_surface_kind text,
  p_image_id uuid,
  p_user_id uuid,
  p_topic_id uuid,
  p_community_id uuid,
  p_user_profile_link_id uuid
)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_placement_id uuid;
  v_revision integer;
BEGIN
  INSERT INTO media_delivery_registry_records (
    delivery_key, placement_id, placement_revision, image_id, desired_state
  )
  SELECT concat('image-placement:', placement.id, ':', placement.revision, ':', surface.image_id),
     placement.id, placement.revision, surface.image_id, 'withheld'
  FROM media_placements placement
  JOIN image_surface_placements surface ON surface.placement_id = placement.id
  WHERE placement.retired_at IS NULL
    AND surface.surface_kind = p_surface_kind
    AND surface.user_id IS NOT DISTINCT FROM p_user_id
    AND surface.topic_id IS NOT DISTINCT FROM p_topic_id
    AND surface.community_id IS NOT DISTINCT FROM p_community_id
    AND surface.user_profile_link_id IS NOT DISTINCT FROM p_user_profile_link_id
    AND surface.image_id IS DISTINCT FROM p_image_id
  ON CONFLICT (delivery_key) DO UPDATE
  SET desired_state = 'withheld',
    state = CASE WHEN media_delivery_registry_records.desired_state IS DISTINCT FROM 'withheld'
      THEN 'pending' ELSE media_delivery_registry_records.state END,
    claimed_at = CASE WHEN media_delivery_registry_records.desired_state IS DISTINCT FROM 'withheld'
      THEN NULL ELSE media_delivery_registry_records.claimed_at END,
    completed_at = CASE WHEN media_delivery_registry_records.desired_state IS DISTINCT FROM 'withheld'
      THEN NULL ELSE media_delivery_registry_records.completed_at END,
    generation = CASE WHEN media_delivery_registry_records.desired_state IS DISTINCT FROM 'withheld'
      THEN media_delivery_registry_records.generation + 1 ELSE media_delivery_registry_records.generation END;

  UPDATE media_placements placement
  SET retired_at = COALESCE(placement.retired_at, CURRENT_TIMESTAMP),
      retirement_reason = 'owner_removed',
      revision = placement.revision + 1
  FROM image_surface_placements surface
  WHERE surface.placement_id = placement.id
    AND placement.retirement_reason IS DISTINCT FROM 'owner_removed'
    AND surface.surface_kind = p_surface_kind
    AND surface.user_id IS NOT DISTINCT FROM p_user_id
    AND surface.topic_id IS NOT DISTINCT FROM p_topic_id
    AND surface.community_id IS NOT DISTINCT FROM p_community_id
    AND surface.user_profile_link_id IS NOT DISTINCT FROM p_user_profile_link_id
    AND surface.image_id IS DISTINCT FROM p_image_id;

  IF p_image_id IS NULL THEN RETURN; END IF;

  SELECT placement.id, placement.revision INTO v_placement_id, v_revision
  FROM image_surface_placements surface
  JOIN media_placements placement ON placement.id = surface.placement_id
  WHERE surface.surface_kind = p_surface_kind
    AND surface.image_id = p_image_id
    AND surface.user_id IS NOT DISTINCT FROM p_user_id
    AND surface.topic_id IS NOT DISTINCT FROM p_topic_id
    AND surface.community_id IS NOT DISTINCT FROM p_community_id
    AND surface.user_profile_link_id IS NOT DISTINCT FROM p_user_profile_link_id
  ORDER BY placement.id DESC LIMIT 1
  FOR UPDATE OF placement;

  IF v_placement_id IS NULL THEN
    INSERT INTO media_placements DEFAULT VALUES RETURNING id, revision INTO v_placement_id, v_revision;
    INSERT INTO image_surface_placements (
      placement_id, surface_kind, image_id, user_id, topic_id, community_id, user_profile_link_id
    ) VALUES (v_placement_id, p_surface_kind, p_image_id, p_user_id, p_topic_id, p_community_id, p_user_profile_link_id);
  ELSE
    UPDATE media_placements
    SET retired_at = NULL, retirement_reason = NULL, revision = revision + 1
    WHERE id = v_placement_id AND retired_at IS NOT NULL
    RETURNING revision INTO v_revision;
    IF v_revision IS NULL THEN
      SELECT revision INTO v_revision FROM media_placements WHERE id = v_placement_id;
    END IF;
  END IF;

  INSERT INTO media_delivery_registry_records (
    delivery_key, placement_id, placement_revision, image_id, desired_state
  )
  SELECT concat('image-placement:', v_placement_id, ':', v_revision, ':', p_image_id),
     v_placement_id, v_revision, p_image_id,
    CASE WHEN image.deleted_at IS NULL
        AND image.quarantine_pending_at IS NULL
        AND image.openai_omni_moderation_flagged IS NOT TRUE
      THEN 'allow' ELSE 'withheld' END
  FROM images image WHERE image.id = p_image_id
  ON CONFLICT (delivery_key) DO NOTHING;

END;
$$;
