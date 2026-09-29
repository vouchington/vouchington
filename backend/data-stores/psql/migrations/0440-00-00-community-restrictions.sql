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
  id UUID DEFAULT uuidv7() PRIMARY KEY,
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

-- Restrictions a moderator action activated or lifted. Rebuilt into the action's metadata
-- (`restriction_id` / `restriction_ids`) when moderator actions are read.
CREATE TABLE IF NOT EXISTS moderator_action_community_restrictions (
  moderator_action_id UUID NOT NULL REFERENCES moderator_actions (id) ON DELETE CASCADE,
  community_restriction_id UUID NOT NULL REFERENCES community_restrictions (id) ON DELETE CASCADE,
  PRIMARY KEY (moderator_action_id, community_restriction_id)
);

CREATE INDEX IF NOT EXISTS idx_moderator_action_community_restrictions__restriction
  ON moderator_action_community_restrictions (community_restriction_id);

COMMENT ON TABLE moderator_action_community_restrictions IS 'Community restrictions activated or lifted by a moderator action. Restriction types and expiry stay in the action metadata.';
COMMENT ON COLUMN moderator_action_community_restrictions.moderator_action_id IS 'Moderator action that activated or lifted the restriction.';
COMMENT ON COLUMN moderator_action_community_restrictions.community_restriction_id IS 'Community restriction the moderator action targeted.';
