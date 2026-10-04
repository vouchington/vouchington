-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
-- An image is an immutable byte asset.  Public reachability is represented by a
-- separately versioned placement, never by the asset UUID alone.

CREATE TRIGGER trigger_images_id_immutable
BEFORE UPDATE OF id ON images
FOR EACH ROW
  WHEN (ROW(OLD.id) IS DISTINCT FROM ROW(NEW.id)) EXECUTE FUNCTION fn_reject_mutation();

CREATE TABLE image_surface_placements (
  placement_id uuid PRIMARY KEY REFERENCES media_placements(id) ON DELETE RESTRICT,
  surface_kind text NOT NULL CHECK (surface_kind IN (
    'user-profile-image', 'topic-logo-image', 'topic-hero-image',
    'community-profile-image', 'community-banner-image', 'user-profile-link-image'
  )),
  image_id uuid NOT NULL REFERENCES images(id) ON DELETE RESTRICT,
  binding_family text NOT NULL DEFAULT 'surface' CHECK (binding_family = 'surface'),
  user_id uuid REFERENCES users(id) ON DELETE RESTRICT,
  topic_id uuid REFERENCES topics(id) ON DELETE RESTRICT,
  community_id uuid REFERENCES communities(id) ON DELETE RESTRICT,
  user_profile_link_id uuid REFERENCES user_profile_links(id) ON DELETE RESTRICT,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (placement_id, surface_kind),
  CHECK (
    (surface_kind = 'user-profile-image'
      AND topic_id IS NULL AND community_id IS NULL AND user_profile_link_id IS NULL)
    OR (surface_kind IN ('topic-logo-image', 'topic-hero-image') AND topic_id IS NOT NULL
      AND user_id IS NULL AND community_id IS NULL AND user_profile_link_id IS NULL)
    OR (surface_kind IN ('community-profile-image', 'community-banner-image') AND community_id IS NOT NULL
      AND user_id IS NULL AND topic_id IS NULL AND user_profile_link_id IS NULL)
    OR (surface_kind = 'user-profile-link-image'
      AND user_id IS NULL AND topic_id IS NULL AND community_id IS NULL)
  )
);

CREATE TABLE image_surface_placement_activations (
  placement_id uuid NOT NULL,
  surface_kind text NOT NULL CHECK (surface_kind IN (
    'user-profile-image', 'topic-logo-image', 'topic-hero-image',
    'community-profile-image', 'community-banner-image', 'user-profile-link-image'
  )),
  placement_revision integer NOT NULL CHECK (placement_revision >= 0),
  bound_by_user_id uuid NOT NULL REFERENCES retained_user_identities(id) ON DELETE RESTRICT,
  uploaded_by_user_id uuid NOT NULL REFERENCES retained_user_identities(id) ON DELETE RESTRICT,
  bound_by_administrator boolean,
  bound_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (placement_id, placement_revision),
  FOREIGN KEY (placement_id, surface_kind)
    REFERENCES image_surface_placements(placement_id, surface_kind) ON DELETE RESTRICT,
  CHECK ((surface_kind IN ('community-profile-image', 'community-banner-image')) =
    (bound_by_administrator IS NOT NULL))
);
CREATE INDEX idx_image_surface_placement_activations__bound_by_user
  ON image_surface_placement_activations(bound_by_user_id);
CREATE INDEX idx_image_surface_placement_activations__uploaded_by_user
  ON image_surface_placement_activations(uploaded_by_user_id);
CREATE TRIGGER trigger_image_surface_placement_activations_guard
BEFORE UPDATE OR DELETE ON image_surface_placement_activations
FOR EACH ROW EXECUTE FUNCTION fn_reject_mutation();
COMMENT ON TABLE image_surface_placement_activations IS 'Immutable record of each application activation of an image surface placement.';
COMMENT ON COLUMN image_surface_placement_activations.placement_id IS 'Placement activated by the application.';
COMMENT ON COLUMN image_surface_placement_activations.surface_kind IS 'Surface kind captured with the placement identity.';
COMMENT ON COLUMN image_surface_placement_activations.placement_revision IS 'Placement revision at activation.';
COMMENT ON COLUMN image_surface_placement_activations.bound_by_user_id IS 'Retained identity of the account that selected the image.';
COMMENT ON COLUMN image_surface_placement_activations.uploaded_by_user_id IS 'Retained identity of the original uploader.';
COMMENT ON COLUMN image_surface_placement_activations.bound_by_administrator IS 'Whether a community image setter was an administrator at activation; null for other surfaces.';
COMMENT ON COLUMN image_surface_placement_activations.bound_at IS 'Time the application activated the image placement.';

ALTER TABLE image_surface_placements
ADD CONSTRAINT fk_image_surface_placements__retained_image_binding
FOREIGN KEY (placement_id, image_id, binding_family)
REFERENCES retained_image_placement_bindings (placement_id, image_id, binding_family)
ON DELETE RESTRICT NOT VALID;
ALTER TABLE image_surface_placements
VALIDATE CONSTRAINT fk_image_surface_placements__retained_image_binding;

CREATE UNIQUE INDEX idx_image_surface_placements__user_profile
  ON image_surface_placements (user_id, image_id)
  WHERE surface_kind = 'user-profile-image';
CREATE UNIQUE INDEX idx_image_surface_placements__topic_logo
  ON image_surface_placements (topic_id, image_id)
  WHERE surface_kind = 'topic-logo-image';
CREATE UNIQUE INDEX idx_image_surface_placements__topic_hero
  ON image_surface_placements (topic_id, image_id)
  WHERE surface_kind = 'topic-hero-image';
CREATE UNIQUE INDEX idx_image_surface_placements__community_profile
  ON image_surface_placements (community_id, image_id)
  WHERE surface_kind = 'community-profile-image';
CREATE UNIQUE INDEX idx_image_surface_placements__community_banner
  ON image_surface_placements (community_id, image_id)
  WHERE surface_kind = 'community-banner-image';
CREATE UNIQUE INDEX idx_image_surface_placements__profile_link
  ON image_surface_placements (user_profile_link_id, image_id)
  WHERE surface_kind = 'user-profile-link-image';
CREATE INDEX idx_image_surface_placements__image ON image_surface_placements (image_id);
CREATE INDEX idx_image_surface_placements__user_fk
  ON image_surface_placements (user_id) WHERE user_id IS NOT NULL;
CREATE INDEX idx_image_surface_placements__topic_fk
  ON image_surface_placements (topic_id) WHERE topic_id IS NOT NULL;
CREATE INDEX idx_image_surface_placements__community_fk
  ON image_surface_placements (community_id) WHERE community_id IS NOT NULL;
CREATE INDEX idx_image_surface_placements__profile_link_fk
  ON image_surface_placements (user_profile_link_id) WHERE user_profile_link_id IS NOT NULL;

CREATE OR REPLACE FUNCTION fn_reject_image_surface_placement()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE'
    AND OLD.surface_kind = 'user-profile-link-image'
    AND OLD.user_profile_link_id IS NOT NULL
    AND NEW.user_profile_link_id IS NULL
    AND NEW.placement_id = OLD.placement_id
    AND NEW.surface_kind = OLD.surface_kind
    AND NEW.image_id = OLD.image_id
    AND NEW.user_id IS NOT DISTINCT FROM OLD.user_id
    AND NEW.topic_id IS NOT DISTINCT FROM OLD.topic_id
    AND NEW.community_id IS NOT DISTINCT FROM OLD.community_id
    AND EXISTS (SELECT 1 FROM media_placements placement WHERE placement.id = OLD.placement_id
      AND placement.retired_at IS NOT NULL AND placement.retirement_reason = 'owner_removed' FOR UPDATE)
  THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE'
    AND OLD.surface_kind = 'user-profile-image'
    AND OLD.user_id IS NOT NULL
    AND NEW.user_id IS NULL
    AND NEW.placement_id = OLD.placement_id
    AND NEW.surface_kind = OLD.surface_kind
    AND NEW.image_id = OLD.image_id
    AND NEW.topic_id IS NOT DISTINCT FROM OLD.topic_id
    AND NEW.community_id IS NOT DISTINCT FROM OLD.community_id
    AND NEW.user_profile_link_id IS NOT DISTINCT FROM OLD.user_profile_link_id
    AND EXISTS (SELECT 1 FROM media_placements placement WHERE placement.id = OLD.placement_id
      AND placement.retired_at IS NOT NULL AND placement.retirement_reason = 'owner_removed' FOR UPDATE)
  THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' AND num_nonnulls(NEW.user_id, NEW.topic_id, NEW.community_id, NEW.user_profile_link_id) <> 1 THEN
    RAISE EXCEPTION 'new image surface requires one concrete live owner' USING ERRCODE = 'check_violation';
  END IF;
  IF TG_OP = 'INSERT' AND EXISTS (
    SELECT 1
    FROM image_surface_placements existing
    JOIN media_placements placement ON placement.id = existing.placement_id
    WHERE placement.retired_at IS NULL
      AND existing.surface_kind = NEW.surface_kind
    AND existing.user_id IS NOT DISTINCT FROM NEW.user_id
      AND existing.topic_id IS NOT DISTINCT FROM NEW.topic_id
      AND existing.community_id IS NOT DISTINCT FROM NEW.community_id
      AND existing.user_profile_link_id IS NOT DISTINCT FROM NEW.user_profile_link_id
  ) THEN
    RAISE EXCEPTION 'a public image surface has at most one current binding' USING ERRCODE = 'unique_violation';
  END IF;
  IF TG_OP = 'INSERT' THEN RETURN NEW; END IF;
  RAISE EXCEPTION 'image surface placement bindings are immutable' USING ERRCODE = 'check_violation';
END;
$$;

CREATE TRIGGER trigger_image_surface_placement_guard
BEFORE INSERT OR UPDATE OR DELETE ON image_surface_placements
FOR EACH ROW EXECUTE FUNCTION fn_reject_image_surface_placement();

CREATE OR REPLACE FUNCTION fn_reject_ownerless_image_surface_retirement()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_ownerless boolean;
BEGIN
  SELECT num_nonnulls(surface.user_id, surface.topic_id, surface.community_id, surface.user_profile_link_id) = 0
  INTO v_ownerless FROM image_surface_placements surface WHERE surface.placement_id = NEW.id
  FOR UPDATE;
  IF v_ownerless AND (NEW.retired_at IS NULL OR NEW.retirement_reason IS DISTINCT FROM 'owner_removed') THEN
    RAISE EXCEPTION 'ownerless image surface must remain retired for owner removal' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trigger_guard_ownerless_image_surface_retirement
BEFORE UPDATE ON media_placements
FOR EACH ROW EXECUTE FUNCTION fn_reject_ownerless_image_surface_retirement();

CREATE TRIGGER trigger_image_surface_placements_updated_at
BEFORE UPDATE ON image_surface_placements
FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();

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
    RAISE EXCEPTION 'image surface requires an independently reserved placement before owner update'
      USING ERRCODE = 'check_violation';
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

CREATE OR REPLACE FUNCTION fn_project_user_profile_image_placement()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.profile_image_id IS DISTINCT FROM OLD.profile_image_id THEN
    PERFORM fn_sync_image_surface_placement('user-profile-image', NEW.profile_image_id, NEW.id, NULL, NULL, NULL);
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trigger_sync_user_profile_image_placement
AFTER INSERT OR UPDATE OF profile_image_id ON users
FOR EACH ROW EXECUTE FUNCTION fn_project_user_profile_image_placement();

CREATE OR REPLACE FUNCTION fn_project_retire_deleted_user_image_surfaces()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL THEN
    PERFORM fn_sync_image_surface_placement('user-profile-image', NULL, NEW.id, NULL, NULL, NULL);
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trigger_retire_deleted_user_image_surfaces
AFTER UPDATE OF deleted_at ON users
FOR EACH ROW EXECUTE FUNCTION fn_project_retire_deleted_user_image_surfaces();

CREATE OR REPLACE FUNCTION fn_project_handoff_deleted_user_image_surfaces()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM fn_sync_image_surface_placement('user-profile-image', NULL, OLD.id, NULL, NULL, NULL);
  UPDATE image_surface_placements
  SET user_id = NULL
  WHERE surface_kind = 'user-profile-image' AND user_id = OLD.id;
  RETURN OLD;
END;
$$;
CREATE TRIGGER trigger_handoff_deleted_user_image_surfaces
BEFORE DELETE ON users
FOR EACH ROW EXECUTE FUNCTION fn_project_handoff_deleted_user_image_surfaces();

CREATE OR REPLACE FUNCTION fn_project_topic_image_placements()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND (
    (NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL)
    OR (NEW.merged_into_topic_id IS NOT NULL AND OLD.merged_into_topic_id IS NULL)
  ) THEN
    PERFORM fn_sync_image_surface_placement('topic-logo-image', NULL, NULL, NEW.id, NULL, NULL);
    PERFORM fn_sync_image_surface_placement('topic-hero-image', NULL, NULL, NEW.id, NULL, NULL);
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' OR NEW.logo_image_id IS DISTINCT FROM OLD.logo_image_id THEN
    PERFORM fn_sync_image_surface_placement('topic-logo-image', NEW.logo_image_id, NULL, NEW.id, NULL, NULL);
  END IF;
  IF TG_OP = 'INSERT' OR NEW.hero_image_id IS DISTINCT FROM OLD.hero_image_id THEN
    PERFORM fn_sync_image_surface_placement('topic-hero-image', NEW.hero_image_id, NULL, NEW.id, NULL, NULL);
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trigger_sync_topic_image_placements
AFTER INSERT OR UPDATE OF logo_image_id, hero_image_id, deleted_at, merged_into_topic_id ON topics
FOR EACH ROW EXECUTE FUNCTION fn_project_topic_image_placements();

CREATE OR REPLACE FUNCTION fn_project_community_image_placements()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL THEN
    PERFORM fn_sync_image_surface_placement('community-profile-image', NULL, NULL, NULL, NEW.id, NULL);
    PERFORM fn_sync_image_surface_placement('community-banner-image', NULL, NULL, NULL, NEW.id, NULL);
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' OR NEW.profile_image_id IS DISTINCT FROM OLD.profile_image_id THEN
    PERFORM fn_sync_image_surface_placement('community-profile-image', NEW.profile_image_id, NULL, NULL, NEW.id, NULL);
  END IF;
  IF TG_OP = 'INSERT' OR NEW.banner_image_id IS DISTINCT FROM OLD.banner_image_id THEN
    PERFORM fn_sync_image_surface_placement('community-banner-image', NEW.banner_image_id, NULL, NULL, NEW.id, NULL);
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trigger_sync_community_image_placements
AFTER INSERT OR UPDATE OF profile_image_id, banner_image_id, deleted_at ON communities
FOR EACH ROW EXECUTE FUNCTION fn_project_community_image_placements();

CREATE OR REPLACE FUNCTION fn_project_user_profile_link_image_placement()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.image_id IS DISTINCT FROM OLD.image_id THEN
    PERFORM fn_sync_image_surface_placement('user-profile-link-image', NEW.image_id, NULL, NULL, NULL, NEW.id);
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trigger_sync_user_profile_link_image_placement
AFTER INSERT OR UPDATE OF image_id ON user_profile_links
FOR EACH ROW EXECUTE FUNCTION fn_project_user_profile_link_image_placement();

CREATE OR REPLACE FUNCTION fn_project_retire_deleted_profile_link_image_surfaces()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM fn_sync_image_surface_placement('user-profile-link-image', NULL, NULL, NULL, NULL, OLD.id);
  UPDATE image_surface_placements SET user_profile_link_id = NULL
  WHERE surface_kind = 'user-profile-link-image' AND user_profile_link_id = OLD.id;
  RETURN OLD;
END;
$$;
CREATE TRIGGER trigger_retire_deleted_profile_link_image_surfaces
BEFORE DELETE ON user_profile_links
FOR EACH ROW EXECUTE FUNCTION fn_project_retire_deleted_profile_link_image_surfaces();

CREATE OR REPLACE FUNCTION fn_image_placement_publicly_projected(
  p_placement_id uuid,
  p_revision integer,
  p_image_id uuid
)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1
    FROM images image
    WHERE image.id = p_image_id
      AND image.deleted_at IS NULL
      AND image.upload_completed_at IS NOT NULL
      AND image.quarantine_pending_at IS NULL
      AND image.openai_omni_moderation_flagged = FALSE
      AND image.openai_omni_moderation_results IS NOT NULL
      AND image.openai_omni_moderation_created_at IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM media_delivery_registry_records registry
        WHERE registry.delivery_key = concat('image-placement:', p_placement_id, ':', p_revision, ':', p_image_id)
          AND registry.desired_state = 'allow'
          AND registry.state = 'completed'
      )
  );
$$;

COMMENT ON FUNCTION fn_image_placement_publicly_projected(uuid, integer, uuid)
IS 'Projects only an exact image placement tuple that has completed its allowed edge delivery state.';

COMMENT ON TABLE image_surface_placements IS 'Immutable bindings for non-post persisted public image surfaces. Each surface has typed foreign-key columns; no polymorphic owner reference is permitted.';
COMMENT ON COLUMN image_surface_placements.placement_id IS 'Stable media placement identifier that scopes public delivery to this persisted surface use.';
COMMENT ON COLUMN image_surface_placements.surface_kind IS 'Typed persisted surface owning this image use; exactly one matching owner branch is required.';
COMMENT ON COLUMN image_surface_placements.image_id IS 'Immutable byte asset bound to this surface placement.';
COMMENT ON COLUMN image_surface_placements.binding_family IS 'Literal surface family checked by the retained image placement triple foreign key.';
COMMENT ON COLUMN image_surface_placements.user_id IS 'Concrete live profile owner; cleared only after terminal owner-removal retirement on hard deletion.';
COMMENT ON COLUMN image_surface_placements.topic_id IS 'Topic owner for a logo or hero image surface.';
COMMENT ON COLUMN image_surface_placements.community_id IS 'Community owner for a profile or banner image surface.';
COMMENT ON COLUMN image_surface_placements.user_profile_link_id IS 'Concrete live profile-link owner; cleared only after terminal owner-removal retirement on deletion.';
COMMENT ON COLUMN images.id IS 'Immutable UUIDv7 byte-asset identity. Public delivery uses a separately revision-fenced placement tuple.';
