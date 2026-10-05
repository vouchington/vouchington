-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TABLE media_placements (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  revision integer NOT NULL DEFAULT 0 CHECK (revision >= 0),
  activation_revision integer NOT NULL DEFAULT 0 CHECK (activation_revision >= 0 AND activation_revision <= revision),
  retired_at timestamptz,
  retirement_reason media_placement_retirement_reasons CHECK (retirement_reason IN ('asset_deleted', 'owner_removed')),
  copyright_withheld_at timestamptz,
  CHECK (
    (retired_at IS NULL AND retirement_reason IS NULL)
    OR (retired_at IS NOT NULL AND retirement_reason IS NOT NULL)
  ),
  created_at timestamptz GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE media_placements
ADD CONSTRAINT fk_media_placements__retained_image_binding
FOREIGN KEY (id) REFERENCES retained_image_placement_bindings (placement_id)
ON DELETE RESTRICT NOT VALID;
ALTER TABLE media_placements VALIDATE CONSTRAINT fk_media_placements__retained_image_binding;

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TABLE image_placements (
  placement_id uuid PRIMARY KEY REFERENCES media_placements(id) ON DELETE RESTRICT,
  post_id uuid NOT NULL REFERENCES posts(id) ON DELETE RESTRICT,
  image_id uuid NOT NULL REFERENCES images(id) ON DELETE RESTRICT,
  binding_family image_binding_families NOT NULL DEFAULT 'post' CHECK (binding_family = 'post'),
  UNIQUE (post_id, image_id)
);

ALTER TABLE image_placements
ADD CONSTRAINT fk_image_placements__retained_image_binding
FOREIGN KEY (placement_id, image_id, binding_family)
REFERENCES retained_image_placement_bindings (placement_id, image_id, binding_family)
ON DELETE RESTRICT NOT VALID;
ALTER TABLE image_placements VALIDATE CONSTRAINT fk_image_placements__retained_image_binding;

CREATE INDEX idx_image_placements__image ON image_placements (image_id);

CREATE OR REPLACE FUNCTION fn_reject_media_placement()
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
  IF OLD.retired_at IS NOT NULL AND NEW.retired_at IS NULL THEN
    NEW.activation_revision := NEW.revision;
  ELSIF NEW.activation_revision IS DISTINCT FROM OLD.activation_revision THEN
    RAISE EXCEPTION 'media placement activation revision is system-managed' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_media_placement_guard
BEFORE UPDATE OR DELETE ON media_placements
FOR EACH ROW EXECUTE FUNCTION fn_reject_media_placement();

CREATE TRIGGER trigger_media_placements_updated_at
BEFORE UPDATE ON media_placements
FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();

CREATE TRIGGER trigger_image_placement_guard
BEFORE UPDATE OR DELETE ON image_placements
FOR EACH ROW EXECUTE FUNCTION fn_reject_mutation();

COMMENT ON TABLE media_placements IS 'Durable image-use placements; exact binding and revision authority governs public delivery.';
COMMENT ON COLUMN media_placements.revision IS 'Monotonic delivery revision; every availability change advances it exactly once.';
COMMENT ON COLUMN media_placements.activation_revision IS 'Most recent retirement-to-active generation revision, including trigger-only reactivation; copyright parties use an immutable snapshot of this value.';
COMMENT ON COLUMN media_placements.retired_at IS 'Placement is no longer attached to its host surface; retained so stale routes fail closed.';
COMMENT ON COLUMN media_placements.retirement_reason IS 'Why the placement retired. Owner removal supersedes an asset retirement, fencing image-delete rollback from restoring a detached use.';
COMMENT ON COLUMN media_placements.copyright_withheld_at IS 'Placement-specific copyright withholding state; shared source assets remain recoverable.';
COMMENT ON TABLE image_placements IS 'Immutable image binding for a media placement. A post/image pair retains one stable placement identity across detach and reattach.';
COMMENT ON COLUMN image_placements.placement_id IS 'Stable media placement identifier used by trusted delivery routes.';
COMMENT ON COLUMN image_placements.post_id IS 'Hosting post for this immutable image use; retained with the placement so delivery authorization is scoped to the use.';
COMMENT ON COLUMN image_placements.image_id IS 'Immutable byte asset bound to this post placement; an asset can have multiple separately authorized placements.';
COMMENT ON COLUMN image_placements.binding_family IS 'Literal post family checked by the retained image placement triple foreign key.';
