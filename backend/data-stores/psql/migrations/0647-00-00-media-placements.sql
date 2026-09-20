CREATE TABLE media_placements (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  placement_kind text NOT NULL CHECK (placement_kind IN ('image')),
  revision integer NOT NULL DEFAULT 0 CHECK (revision >= 0),
  retired_at timestamptz,
  retirement_reason text CHECK (retirement_reason IN ('asset_deleted', 'owner_removed')),
  copyright_withheld_at timestamptz,
  CHECK (
    (retired_at IS NULL AND retirement_reason IS NULL)
    OR (retired_at IS NOT NULL AND retirement_reason IS NOT NULL)
  ),
  created_at timestamptz GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL
);

CREATE TABLE image_placements (
  placement_id uuid PRIMARY KEY REFERENCES media_placements(id) ON DELETE RESTRICT,
  post_id uuid NOT NULL REFERENCES posts(id) ON DELETE RESTRICT,
  image_id uuid NOT NULL REFERENCES images(id) ON DELETE RESTRICT,
  UNIQUE (post_id, image_id)
);

CREATE INDEX idx_image_placements__image ON image_placements (image_id);

CREATE OR REPLACE FUNCTION fn_guard_media_placement()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'media placements are retained for legal revision fencing' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.placement_kind IS DISTINCT FROM OLD.placement_kind THEN
    RAISE EXCEPTION 'media placement kind is immutable' USING ERRCODE = 'check_violation';
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

CREATE TRIGGER trigger_media_placement_guard
BEFORE UPDATE OR DELETE ON media_placements
FOR EACH ROW EXECUTE FUNCTION fn_guard_media_placement();

CREATE OR REPLACE FUNCTION fn_guard_image_placement()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'image placement bindings are immutable' USING ERRCODE = 'check_violation';
END;
$$;

CREATE TRIGGER trigger_image_placement_guard
BEFORE UPDATE OR DELETE ON image_placements
FOR EACH ROW EXECUTE FUNCTION fn_guard_image_placement();

WITH bindings AS (
  SELECT uuidv7() AS placement_id, post_id, image_id
  FROM post_images
), registered AS (
  INSERT INTO media_placements (id, placement_kind)
  SELECT placement_id, 'image' FROM bindings
  RETURNING id
)
INSERT INTO image_placements (placement_id, post_id, image_id)
SELECT placement_id, post_id, image_id FROM bindings;

ALTER TABLE copyright_notice_targets DISABLE TRIGGER trigger_copyright_notice_targets_immutable;

UPDATE copyright_notice_targets target
SET placement_key = concat('image-placement:', placement.id),
    placement_revision = placement.revision
FROM copyright_notice_target_images target_image
JOIN image_placements image_placement ON image_placement.image_id = target_image.image_id
JOIN media_placements placement ON placement.id = image_placement.placement_id
WHERE target_image.copyright_notice_target_id = target.id
  AND target.placement_key = concat(
    'post-image:', image_placement.post_id, ':', image_placement.image_id
  );

ALTER TABLE copyright_notice_targets ENABLE TRIGGER trigger_copyright_notice_targets_immutable;

COMMENT ON TABLE media_placements IS 'Media-neutral, durable hosted-use placements. Delivery availability is revision-fenced and never inferred from an asset alone.';
COMMENT ON COLUMN media_placements.placement_kind IS 'Typed binding kind. Additional media kinds receive their own immutable binding tables.';
COMMENT ON COLUMN media_placements.revision IS 'Monotonic delivery revision; every availability change advances it exactly once.';
COMMENT ON COLUMN media_placements.retired_at IS 'Placement is no longer attached to its host surface; retained so stale routes fail closed.';
COMMENT ON COLUMN media_placements.retirement_reason IS 'Why the placement retired. Owner removal supersedes an asset retirement, fencing image-delete rollback from restoring a detached use.';
COMMENT ON COLUMN media_placements.copyright_withheld_at IS 'Placement-specific copyright withholding state; shared source assets remain recoverable.';
COMMENT ON TABLE image_placements IS 'Immutable image binding for a media placement. A post/image pair retains one stable placement identity across detach and reattach.';
COMMENT ON COLUMN image_placements.placement_id IS 'Stable media placement identifier used by trusted delivery routes.';
