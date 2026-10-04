-- Canonical identity owners outlive their live entity rows. They contain no authorization facts.
CREATE TABLE IF NOT EXISTS retained_user_identities (
  id UUID PRIMARY KEY
);
COMMENT ON TABLE retained_user_identities IS 'Concrete user identity owner that outlives the live row while durable references remain; never authorizes actions.';

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TABLE IF NOT EXISTS retained_membership_identities (
  id UUID PRIMARY KEY
);
COMMENT ON TABLE retained_membership_identities IS 'Concrete membership identity retained while durable ledger references remain; never authorizes membership access.';
COMMENT ON COLUMN retained_membership_identities.id IS 'UUIDv7 identity registered with the live membership projection and retained after it is deleted.';

CREATE TABLE IF NOT EXISTS retained_api_key_identities (
  id UUID PRIMARY KEY
);
COMMENT ON TABLE retained_api_key_identities IS 'Concrete API key identity owner that outlives the live row while durable audit references remain; never authorizes calls.';

CREATE TABLE IF NOT EXISTS retained_topic_identities (
  id UUID PRIMARY KEY
);
COMMENT ON TABLE retained_topic_identities IS 'Concrete topic identity owner that outlives the live row while durable references remain.';

CREATE TABLE IF NOT EXISTS retained_post_identities (
  id UUID PRIMARY KEY
) PARTITION BY RANGE (id);
COMMENT ON TABLE retained_post_identities IS 'Concrete post identity owner that outlives the live row while durable references remain.';

CREATE TABLE IF NOT EXISTS retained_post_identities_default
  PARTITION OF retained_post_identities DEFAULT;

CREATE TABLE IF NOT EXISTS retained_rss_feed_item_identities (
  id UUID PRIMARY KEY
) PARTITION BY RANGE (id);
COMMENT ON TABLE retained_rss_feed_item_identities IS 'Concrete RSS item identity owner that outlives the live row while durable references remain.';

CREATE TABLE IF NOT EXISTS retained_rss_feed_item_identities_default
  PARTITION OF retained_rss_feed_item_identities DEFAULT;

CREATE TABLE IF NOT EXISTS retained_image_identities (
  id UUID PRIMARY KEY,
  created_by_id UUID NOT NULL REFERENCES retained_user_identities (id) ON DELETE RESTRICT,
  UNIQUE (id, created_by_id)
) PARTITION BY RANGE (id);
COMMENT ON TABLE retained_image_identities IS 'Concrete image byte identity and original uploader provenance retained while live or durable references remain; never delivery or account authority.';
COMMENT ON COLUMN retained_image_identities.created_by_id IS 'Immutable original uploader retained user identity, including after the live image or user row is deleted.';

CREATE TABLE IF NOT EXISTS retained_image_identities_default
  PARTITION OF retained_image_identities DEFAULT;

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX IF NOT EXISTS idx_retained_image_identities__created_by_id
ON retained_image_identities (created_by_id);

CREATE TRIGGER trigger_guard_retained_image_uploader
BEFORE UPDATE OF id, created_by_id ON retained_image_identities
FOR EACH ROW
  WHEN (ROW(OLD.id, OLD.created_by_id) IS DISTINCT FROM ROW(NEW.id, NEW.created_by_id)) EXECUTE FUNCTION fn_reject_mutation();

CREATE TABLE IF NOT EXISTS retained_image_placement_bindings (
  placement_id UUID PRIMARY KEY,
  image_id UUID NOT NULL REFERENCES retained_image_identities (id) ON DELETE RESTRICT,
  binding_family image_binding_families NOT NULL CHECK (binding_family IN ('post', 'surface')),
  UNIQUE (placement_id, image_id),
  CONSTRAINT uq_reta_imag_plac_bindi__placement_id__image_id__binding_family UNIQUE (placement_id, image_id, binding_family)
) PARTITION BY RANGE (placement_id);
COMMENT ON TABLE retained_image_placement_bindings IS 'Immutable image, placement and post/surface family identity retained with live or durable references; never delivery authority.';
COMMENT ON COLUMN retained_image_placement_bindings.placement_id IS 'UUIDv7 placement identity created with its live owner transaction.';
COMMENT ON COLUMN retained_image_placement_bindings.image_id IS 'Exact immutable image identity for this placement.';
COMMENT ON COLUMN retained_image_placement_bindings.binding_family IS 'Post or surface live-child family fixed at first insertion.';

CREATE TABLE IF NOT EXISTS retained_image_placement_bindings_default
  PARTITION OF retained_image_placement_bindings DEFAULT;

CREATE INDEX IF NOT EXISTS idx_retained_image_placement_bindings__image_id
ON retained_image_placement_bindings (image_id);

CREATE TRIGGER trigger_guard_retained_image_placement_binding
BEFORE UPDATE OF placement_id, image_id, binding_family ON retained_image_placement_bindings
FOR EACH ROW
  WHEN (ROW(OLD.placement_id, OLD.image_id, OLD.binding_family) IS DISTINCT FROM ROW(NEW.placement_id, NEW.image_id, NEW.binding_family)) EXECUTE FUNCTION fn_reject_mutation();

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TABLE IF NOT EXISTS retained_identity_cleanup_progress (
  family retained_identity_cleanup_families PRIMARY KEY CHECK (family IN ('user', 'api_key', 'topic', 'post', 'rss_feed_item', 'image', 'membership', 'image_placement_binding')),
  cursor_identity_id UUID,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE OR REPLACE TRIGGER trg_retained_identity_cleanup_progress__updated_at
BEFORE UPDATE ON retained_identity_cleanup_progress
FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();
COMMENT ON TABLE retained_identity_cleanup_progress IS 'One operational keyset cursor per concrete retained root family.';
COMMENT ON COLUMN retained_identity_cleanup_progress.family IS 'Concrete retained root family selected by the cleanup worker.';
COMMENT ON COLUMN retained_identity_cleanup_progress.cursor_identity_id IS 'Last scanned identity, not a durable relationship to that identity.';

INSERT INTO retained_identity_cleanup_progress (family)
VALUES ('user'), ('api_key'), ('topic'), ('post'), ('rss_feed_item'), ('image'), ('membership'), ('image_placement_binding')
ON CONFLICT (family) DO NOTHING;

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TYPE retained_identity_families AS ENUM ('user', 'api_key', 'topic', 'post', 'rss_feed_item', 'membership');
COMMENT ON TYPE retained_identity_families IS 'Concrete identity owners supported by the shared ownership fence; image identity requires its uploader and uses a separate creator.';

CREATE OR REPLACE FUNCTION fn_ensure_retained_identity(family retained_identity_families, identity_id UUID)
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE
  owner_table TEXT := 'retained_' || family::text || '_identities';
  pinned_id UUID;
BEGIN
  -- Cleanup can remove an orphan between the conflict and key-share reads.
  -- Retry until this transaction pins the retained owner.
  LOOP
    EXECUTE format('INSERT INTO %I (id) VALUES ($1) ON CONFLICT (id) DO NOTHING', owner_table)
      USING identity_id;
    EXECUTE format('SELECT id FROM %I WHERE id = $1 FOR KEY SHARE', owner_table)
      INTO pinned_id USING identity_id;
    EXIT WHEN pinned_id IS NOT NULL;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION fn_register_retained_identity()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  PERFORM fn_ensure_retained_identity(TG_ARGV[0]::retained_identity_families, NEW.id);
  RETURN NEW;
END;
$$;

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE OR REPLACE FUNCTION fn_ensure_retained_actor_identity()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE actor_user_id UUID := (to_jsonb(NEW) ->> TG_ARGV[0])::uuid;
BEGIN
  IF actor_user_id IS NOT NULL THEN
    PERFORM fn_ensure_retained_identity('user', actor_user_id);
  END IF;
  RETURN NEW;
END;
$$;
