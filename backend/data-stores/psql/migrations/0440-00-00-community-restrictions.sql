DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'community_restriction_types') THEN
    CREATE TYPE community_restriction_types AS ENUM (
      'require_post_approval',
      'no_new_member_posts',
      'no_links',
      'approved_members_only'
    );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS community_restrictions (
  id UUID PRIMARY KEY DEFAULT uuidv7() REFERENCES retained_community_restriction_identities (id) ON DELETE RESTRICT,
  community_id UUID NOT NULL REFERENCES communities ON DELETE CASCADE,
  restriction_type community_restriction_types NOT NULL,
  activated_by_id UUID REFERENCES users ON DELETE SET NULL,
  activated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  lifted_at TIMESTAMPTZ,
  lifted_by_id UUID REFERENCES users ON DELETE SET NULL,
  reason TEXT,
  CHECK (reason IS NULL OR char_length(reason) <= 1000),
  CHECK (reason IS NULL OR reason = TRIM(reason))
);

CREATE OR REPLACE FUNCTION fn_register_retained_community_restriction_identity()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  PERFORM fn_ensure_audit_retained_identity('retained_community_restriction_identities'::regclass, NEW.id);
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_register_retained_community_restriction_identity
BEFORE INSERT ON community_restrictions
FOR EACH ROW EXECUTE FUNCTION fn_register_retained_community_restriction_identity();

CREATE OR REPLACE TRIGGER trigger_community_restrictions_updated_at
  BEFORE UPDATE ON community_restrictions FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();

CREATE INDEX IF NOT EXISTS idx_community_restrictions__community__id
  ON community_restrictions (community_id, id DESC);

CREATE INDEX IF NOT EXISTS idx_community_restrictions__active_lookup
  ON community_restrictions (community_id, restriction_type)
  WHERE lifted_at IS NULL;

COMMENT ON TABLE community_restrictions IS 'Tracks temporary community-wide moderation restrictions for Raid Mode. NULL lifted_at means the restriction was not manually lifted; expires_at may still make it inactive.';
COMMENT ON COLUMN community_restrictions.community_id IS 'Community this restriction applies to.';
COMMENT ON COLUMN community_restrictions.restriction_type IS 'Restriction behavior enforced while active.';
COMMENT ON COLUMN community_restrictions.activated_by_id IS 'Moderator, owner, or admin who activated the restriction.';
COMMENT ON COLUMN community_restrictions.activated_at IS 'When the restriction was activated.';
COMMENT ON COLUMN community_restrictions.expires_at IS 'When the restriction expires. NULL means manual lift only.';
COMMENT ON COLUMN community_restrictions.updated_at IS 'When the restriction row was last updated.';
COMMENT ON COLUMN community_restrictions.lifted_at IS 'When a moderator manually lifted the restriction early. NULL means not manually lifted.';
COMMENT ON COLUMN community_restrictions.lifted_by_id IS 'Who lifted the restriction early.';
COMMENT ON COLUMN community_restrictions.reason IS 'Optional reason recorded for moderation history.';

CREATE TABLE IF NOT EXISTS moderator_action_restrictions (
  action_id UUID NOT NULL REFERENCES moderator_actions (id) ON DELETE CASCADE,
  position INTEGER NOT NULL CHECK (position >= 0),
  restriction_id UUID NOT NULL REFERENCES retained_community_restriction_identities (id) ON DELETE RESTRICT,
  restriction_type community_restriction_types NOT NULL,
  PRIMARY KEY (action_id, position)
);
COMMENT ON TABLE moderator_action_restrictions IS 'Ordered restriction identities captured on activate or lift moderator actions.';
COMMENT ON COLUMN moderator_action_restrictions.action_id IS 'Moderator action that recorded these restrictions.';
COMMENT ON COLUMN moderator_action_restrictions.position IS 'Zero-based order matching the captured restriction list.';
COMMENT ON COLUMN moderator_action_restrictions.restriction_id IS 'Retained community restriction identity. It does not keep the restriction active.';
COMMENT ON COLUMN moderator_action_restrictions.restriction_type IS 'Restriction behavior captured with that identity.';
CREATE INDEX IF NOT EXISTS idx_moderator_action_restrictions__restriction_id
  ON moderator_action_restrictions (restriction_id);

CREATE OR REPLACE FUNCTION fn_moderator_action_metadata(p_action_id UUID)
RETURNS JSONB
LANGUAGE sql
STABLE
AS $fn$
  SELECT
    jsonb_strip_nulls(jsonb_build_object(
      'role', ma.metadata_role::text,
      'previous_role', ma.metadata_previous_role::text,
      'reason', ma.metadata_reason,
      'imageId', ma.metadata_image_id,
      'source_key', ma.metadata_source_key,
      'moderation_training', ma.metadata_moderation_training,
      'topic_slugs', (
        SELECT jsonb_agg(topic_slug ORDER BY position)
        FROM moderator_action_topic_slugs
        WHERE action_id = ma.id
      ),
      'restriction_id', CASE
        WHEN NOT ma.metadata_expires_at_present THEN (
          SELECT restriction_id
          FROM moderator_action_restrictions
          WHERE action_id = ma.id
          ORDER BY position
          LIMIT 1
        )
      END,
      'restriction_type', CASE
        WHEN NOT ma.metadata_expires_at_present THEN (
          SELECT restriction_type::text
          FROM moderator_action_restrictions
          WHERE action_id = ma.id
          ORDER BY position
          LIMIT 1
        )
      END,
      'restriction_ids', CASE
        WHEN ma.metadata_expires_at_present THEN (
          SELECT jsonb_agg(restriction_id ORDER BY position)
          FROM moderator_action_restrictions
          WHERE action_id = ma.id
        )
      END,
      'restriction_types', CASE
        WHEN ma.metadata_expires_at_present THEN (
          SELECT jsonb_agg(restriction_type ORDER BY position)
          FROM moderator_action_restrictions
          WHERE action_id = ma.id
        )
      END
    ))
    || CASE
      WHEN ma.metadata_expires_at_present
        THEN jsonb_build_object('expires_at', to_jsonb(ma.metadata_expires_at))
      ELSE '{}'::jsonb
    END
  FROM moderator_actions ma
  WHERE ma.id = p_action_id
$fn$;
