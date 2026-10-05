-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TYPE community_post_review_change_types AS ENUM ('approve', 'reject', 'unpublish', 'restore');
CREATE TABLE IF NOT EXISTS community_post_review_changes (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  community_id UUID NOT NULL REFERENCES communities ON DELETE CASCADE,
  post_id UUID NOT NULL REFERENCES community_post_reviews (post_id) ON DELETE CASCADE,
  changed_by_id UUID REFERENCES retained_user_identities(id) ON DELETE RESTRICT,
  change_type community_post_review_change_types NOT NULL,
  platform_override BOOLEAN NOT NULL,
  reason_code TEXT CHECK (reason_code IS NULL OR char_length(reason_code) BETWEEN 1 AND 100),
  private_note TEXT CHECK (private_note IS NULL OR char_length(private_note) <= 4000),
  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  CHECK (platform_override OR private_note IS NULL),
  CHECK (NOT platform_override OR (changed_by_id IS NOT NULL AND reason_code IS NOT NULL))
) PARTITION BY RANGE (id);

CREATE INDEX IF NOT EXISTS idx_community_post_review_changes__post_id__id
ON community_post_review_changes (post_id, id DESC);

CREATE INDEX IF NOT EXISTS idx_community_post_review_changes__community_id__id
ON community_post_review_changes (community_id, id DESC);

CREATE INDEX IF NOT EXISTS idx_community_post_review_changes__changed_by_id
ON community_post_review_changes (changed_by_id);

COMMENT ON TABLE community_post_review_changes IS 'Append-only audit history for community publication decisions and platform overrides.';
COMMENT ON COLUMN community_post_review_changes.community_id IS 'Community whose publication decision changed.';
COMMENT ON COLUMN community_post_review_changes.post_id IS 'Community post whose publication decision changed.';
COMMENT ON COLUMN community_post_review_changes.changed_by_id IS 'Moderator or platform staff member who performed the action; retained even after the live user is deleted.';
COMMENT ON COLUMN community_post_review_changes.change_type IS 'Publication action recorded by this immutable audit event.';
COMMENT ON COLUMN community_post_review_changes.platform_override IS 'True when the action was exercised with global administrator or site-moderator authority.';
COMMENT ON COLUMN community_post_review_changes.reason_code IS 'Public-safe stable reason code; platform overrides require one in service validation.';
COMMENT ON COLUMN community_post_review_changes.private_note IS 'Private platform-staff context, never exposed to community moderators or public clients.';

CREATE TRIGGER trigger_ensure_community_post_review_changes_actor BEFORE INSERT ON community_post_review_changes FOR EACH ROW EXECUTE FUNCTION fn_ensure_retained_actor_identity('changed_by_id');
CREATE TRIGGER trigger_community_post_review_changes_append_only BEFORE UPDATE OR DELETE ON community_post_review_changes FOR EACH ROW EXECUTE FUNCTION fn_reject_mutation();
