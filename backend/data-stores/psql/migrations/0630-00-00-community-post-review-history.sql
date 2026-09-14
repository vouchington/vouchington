CREATE TABLE IF NOT EXISTS community_post_review_changes (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  community_id UUID NOT NULL REFERENCES communities ON DELETE CASCADE,
  post_id UUID NOT NULL REFERENCES community_post_reviews (post_id) ON DELETE CASCADE,
  actor_user_id UUID REFERENCES users ON DELETE SET NULL,
  action TEXT NOT NULL CHECK (action IN ('approve', 'reject', 'unpublish', 'restore')),
  platform_override BOOLEAN NOT NULL,
  reason_code TEXT CHECK (reason_code IS NULL OR char_length(reason_code) BETWEEN 1 AND 100),
  private_note TEXT CHECK (private_note IS NULL OR char_length(private_note) <= 4000),
  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  CHECK (platform_override OR private_note IS NULL),
  CHECK (NOT platform_override OR (actor_user_id IS NOT NULL AND reason_code IS NOT NULL))
) PARTITION BY RANGE (id);

CREATE INDEX IF NOT EXISTS idx_community_post_review_changes__post_id__id
ON community_post_review_changes (post_id, id DESC);

CREATE INDEX IF NOT EXISTS idx_community_post_review_changes__community_id__id
ON community_post_review_changes (community_id, id DESC);

CREATE INDEX IF NOT EXISTS idx_community_post_review_changes__actor_user_id
ON community_post_review_changes (actor_user_id);

COMMENT ON TABLE community_post_review_changes IS 'Append-only audit history for community publication decisions and platform overrides.';
COMMENT ON COLUMN community_post_review_changes.community_id IS 'Community whose publication decision changed.';
COMMENT ON COLUMN community_post_review_changes.post_id IS 'Community post whose publication decision changed.';
COMMENT ON COLUMN community_post_review_changes.actor_user_id IS 'Moderator or platform staff member who performed the action; retained as NULL if that user is deleted.';
COMMENT ON COLUMN community_post_review_changes.action IS 'Publication action recorded by this immutable audit event.';
COMMENT ON COLUMN community_post_review_changes.platform_override IS 'True when the action was exercised with global administrator or site-moderator authority.';
COMMENT ON COLUMN community_post_review_changes.reason_code IS 'Public-safe stable reason code; platform overrides require one in service validation.';
COMMENT ON COLUMN community_post_review_changes.private_note IS 'Private platform-staff context, never exposed to community moderators or public clients.';
