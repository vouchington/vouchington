-- Canonical identity owners outlive their live entity rows. They contain no authorization facts.
CREATE TABLE IF NOT EXISTS retained_user_identities (
  id UUID PRIMARY KEY
);
COMMENT ON TABLE retained_user_identities IS 'Concrete user identity owner that outlives the live row while durable references remain; never authorizes actions.';

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
  id UUID PRIMARY KEY
) PARTITION BY RANGE (id);
COMMENT ON TABLE retained_image_identities IS 'Concrete image byte identity retained while live or durable references remain; never delivery authority.';

CREATE TABLE IF NOT EXISTS retained_image_identities_default
  PARTITION OF retained_image_identities DEFAULT;

CREATE TABLE IF NOT EXISTS retained_image_placement_bindings (
  placement_id UUID PRIMARY KEY,
  image_id UUID NOT NULL REFERENCES retained_image_identities (id) ON DELETE RESTRICT,
  binding_family TEXT NOT NULL CHECK (binding_family IN ('post', 'surface')),
  UNIQUE (placement_id, image_id),
  UNIQUE (placement_id, image_id, binding_family)
) PARTITION BY RANGE (placement_id);
COMMENT ON TABLE retained_image_placement_bindings IS 'Immutable image, placement and post/surface family identity retained with live or durable references; never delivery authority.';
COMMENT ON COLUMN retained_image_placement_bindings.placement_id IS 'UUIDv7 placement identity created with its live owner transaction.';
COMMENT ON COLUMN retained_image_placement_bindings.image_id IS 'Exact immutable image identity for this placement.';
COMMENT ON COLUMN retained_image_placement_bindings.binding_family IS 'Post or surface live-child family fixed at first insertion.';

CREATE TABLE IF NOT EXISTS retained_image_placement_bindings_default
  PARTITION OF retained_image_placement_bindings DEFAULT;

CREATE INDEX IF NOT EXISTS idx_retained_image_placement_bindings__image_id
ON retained_image_placement_bindings (image_id);

CREATE OR REPLACE FUNCTION fn_guard_retained_image_placement_binding()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(NEW.placement_id, NEW.image_id, NEW.binding_family)
    IS DISTINCT FROM ROW(OLD.placement_id, OLD.image_id, OLD.binding_family) THEN
    RAISE EXCEPTION 'retained image placement binding is immutable' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_guard_retained_image_placement_binding
BEFORE UPDATE ON retained_image_placement_bindings
FOR EACH ROW EXECUTE FUNCTION fn_guard_retained_image_placement_binding();

CREATE TABLE IF NOT EXISTS retained_identity_cleanup_progress (
  family TEXT PRIMARY KEY CHECK (family IN ('user', 'topic', 'post', 'rss_feed_item', 'image', 'image_placement_binding')),
  cursor_identity_id UUID,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
COMMENT ON TABLE retained_identity_cleanup_progress IS 'One operational keyset cursor per concrete retained root family.';
COMMENT ON COLUMN retained_identity_cleanup_progress.family IS 'Concrete retained root family selected by the cleanup worker.';
COMMENT ON COLUMN retained_identity_cleanup_progress.cursor_identity_id IS 'Last scanned identity, not a durable relationship to that identity.';

INSERT INTO retained_identity_cleanup_progress (family)
VALUES ('user'), ('topic'), ('post'), ('rss_feed_item'), ('image'), ('image_placement_binding')
ON CONFLICT (family) DO NOTHING;

CREATE OR REPLACE FUNCTION fn_ensure_retained_image_identity(identity_id UUID)
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  LOOP
    INSERT INTO retained_image_identities (id) VALUES (identity_id) ON CONFLICT (id) DO NOTHING;
    PERFORM id FROM retained_image_identities WHERE id = identity_id FOR KEY SHARE;
    EXIT WHEN FOUND;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION fn_register_retained_image_identity()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  PERFORM fn_ensure_retained_image_identity(NEW.id);
  RETURN NEW;
END;
$$;

-- A conflicting orphan can be deleted by cleanup between ON CONFLICT and key-share.
-- Retry the pin until this transaction holds a durable identity row.
CREATE OR REPLACE FUNCTION fn_ensure_retained_user_identity(identity_id UUID)
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  LOOP
    INSERT INTO retained_user_identities (id) VALUES (identity_id) ON CONFLICT (id) DO NOTHING;
    PERFORM id FROM retained_user_identities WHERE id = identity_id FOR KEY SHARE;
    EXIT WHEN FOUND;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION fn_ensure_retained_topic_identity(identity_id UUID)
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  LOOP
    INSERT INTO retained_topic_identities (id) VALUES (identity_id) ON CONFLICT (id) DO NOTHING;
    PERFORM id FROM retained_topic_identities WHERE id = identity_id FOR KEY SHARE;
    EXIT WHEN FOUND;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION fn_ensure_retained_post_identity(identity_id UUID)
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  LOOP
    INSERT INTO retained_post_identities (id) VALUES (identity_id) ON CONFLICT (id) DO NOTHING;
    PERFORM id FROM retained_post_identities WHERE id = identity_id FOR KEY SHARE;
    EXIT WHEN FOUND;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION fn_ensure_retained_rss_feed_item_identity(identity_id UUID)
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  LOOP
    INSERT INTO retained_rss_feed_item_identities (id) VALUES (identity_id) ON CONFLICT (id) DO NOTHING;
    PERFORM id FROM retained_rss_feed_item_identities WHERE id = identity_id FOR KEY SHARE;
    EXIT WHEN FOUND;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION fn_register_retained_user_identity()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  PERFORM fn_ensure_retained_user_identity(NEW.id);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION fn_register_retained_topic_identity()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  PERFORM fn_ensure_retained_topic_identity(NEW.id);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION fn_register_retained_post_identity()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  PERFORM fn_ensure_retained_post_identity(NEW.id);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION fn_register_retained_rss_feed_item_identity()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  PERFORM fn_ensure_retained_rss_feed_item_identity(NEW.id);
  RETURN NEW;
END;
$$;
