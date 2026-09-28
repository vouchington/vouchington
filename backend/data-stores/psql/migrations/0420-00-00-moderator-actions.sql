-- Coalesced pre-launch domain baseline.
-- edited-in-place: pre-launch, never deployed to production

DO $$
BEGIN
  CREATE TYPE moderator_action_types AS ENUM (
    'remove',
    'approve',
    'reject',
    'ban',
    'lift_ban',
    'activate_restriction',
    'lift_restriction',
    'warn',
    'lock',
    'unlock',
    'pin',
    'unpin',
    'tag',
    'suspend',
    'unsuspend',
    'remove_member',
    'change_role',
    'resolve_report',
    'dismiss_report',
    'resolve_appeal',
    'dismiss_appeal'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

CREATE TABLE IF NOT EXISTS moderator_actions (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  -- guardrails-disable-next-line uuid-must-be-key
  community_id uuid REFERENCES communities (id) ON DELETE SET NULL,
  moderation_transparency_community_id uuid REFERENCES retained_community_identities (id) ON DELETE RESTRICT,
  -- guardrails-disable-next-line uuid-must-be-key
  actor_id uuid REFERENCES users (id) ON DELETE SET NULL,
  action_type moderator_action_types NOT NULL,
  -- guardrails-disable-next-line uuid-must-be-key
  post_id uuid REFERENCES posts (id) ON DELETE SET NULL,
  -- guardrails-disable-next-line uuid-must-be-key
  target_user_id uuid REFERENCES users (id) ON DELETE SET NULL,
  -- guardrails-disable-next-line uuid-must-be-key
  report_id uuid REFERENCES moderation_reports (id) ON DELETE SET NULL,
  -- guardrails-disable-next-line uuid-must-be-key
  review_dispute_id uuid REFERENCES review_disputes (id) ON DELETE SET NULL,
  -- guardrails-disable-next-line uuid-must-be-key
  moderation_appeal_id uuid,
  -- guardrails-disable-next-line uuid-must-be-key
  community_application_id uuid REFERENCES community_applications (id) ON DELETE SET NULL,
  reason text,
  metadata_role community_member_roles,
  metadata_previous_role community_member_roles,
  metadata_expires_at TEXT,
  metadata_expires_at_present BOOLEAN NOT NULL DEFAULT FALSE,
  metadata_reason TEXT,
  metadata_image_id UUID REFERENCES retained_image_identities (id) ON DELETE RESTRICT,
  metadata_source_key TEXT,
  metadata_moderation_training BOOLEAN,
  created_at timestamptz GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL
  -- Note: no num_nonnulls >= 1 CHECK here — ON DELETE SET NULL on FK columns could
  -- null out the only target reference and cause the CHECK to block hard-deletes.
);

CREATE INDEX IF NOT EXISTS idx_moderator_actions__community__id
  ON moderator_actions (community_id, id DESC);

CREATE INDEX IF NOT EXISTS idx_moderator_actions__id
  ON moderator_actions (id DESC);

CREATE INDEX IF NOT EXISTS idx_moderator_actions__actor__id
  ON moderator_actions (actor_id, id DESC);

COMMENT ON TABLE moderator_actions IS 'Append-only unified log of moderator/admin actions.';

COMMENT ON COLUMN moderator_actions.community_id IS 'Community scope; NULL for global/platform-level actions.';

COMMENT ON COLUMN moderator_actions.actor_id IS 'Moderator/admin who took the action (ON DELETE SET NULL for audit persistence).';

COMMENT ON COLUMN moderator_actions.action_type IS 'Type of moderation action taken.';

COMMENT ON COLUMN moderator_actions.post_id IS 'Target post or comment (ON DELETE SET NULL for audit persistence).';

COMMENT ON COLUMN moderator_actions.target_user_id IS 'Target user for bans, suspensions, warnings, member actions.';

COMMENT ON COLUMN moderator_actions.report_id IS 'Target moderation report for resolve/dismiss actions.';

COMMENT ON COLUMN moderator_actions.review_dispute_id IS 'Target review dispute for dispute-resolution actions.';

COMMENT ON COLUMN moderator_actions.community_application_id IS 'Target community application for approve/reject actions.';

COMMENT ON COLUMN moderator_actions.reason IS 'Optional free-text reason for the action.';
COMMENT ON COLUMN moderator_actions.metadata_role IS 'Community role after a change_role action.';
COMMENT ON COLUMN moderator_actions.metadata_previous_role IS 'Community role before a change_role action.';
COMMENT ON COLUMN moderator_actions.metadata_expires_at IS 'ISO expiry captured when a restriction was activated. Null with metadata_expires_at_present means an explicit null expiry.';
COMMENT ON COLUMN moderator_actions.metadata_expires_at_present IS 'True when restriction activation included expires_at.';
COMMENT ON COLUMN moderator_actions.metadata_reason IS 'Image auto-removal reason stored separately from the action reason.';
COMMENT ON COLUMN moderator_actions.metadata_image_id IS 'Retained image identity removed by automated image moderation. It does not authorize delivery.';
COMMENT ON COLUMN moderator_actions.metadata_source_key IS 'Automod source key when the action came from moderation training.';
COMMENT ON COLUMN moderator_actions.metadata_moderation_training IS 'True when moderation training recorded this action. Null when that key was absent.';
COMMENT ON COLUMN moderator_actions.moderation_transparency_community_id IS 'Retained community identity stamped for global-transparency exclusion. It does not authorize the community.';

CREATE INDEX IF NOT EXISTS idx_moderator_actions__transparency_community_id
  ON moderator_actions (moderation_transparency_community_id)
  WHERE moderation_transparency_community_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_moderator_actions__metadata_image_id
  ON moderator_actions (metadata_image_id) WHERE metadata_image_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS moderator_action_topic_slugs (
  action_id UUID NOT NULL REFERENCES moderator_actions (id) ON DELETE CASCADE,
  position INTEGER NOT NULL CHECK (position >= 0),
  topic_slug TEXT NOT NULL CHECK (char_length(topic_slug) BETWEEN 1 AND 255),
  PRIMARY KEY (action_id, position)
);
COMMENT ON TABLE moderator_action_topic_slugs IS 'Ordered topic slugs captured when a moderator tags a post.';
COMMENT ON COLUMN moderator_action_topic_slugs.action_id IS 'Tag moderator action these slugs belong to.';
COMMENT ON COLUMN moderator_action_topic_slugs.position IS 'Zero-based order of the tagged slug.';
COMMENT ON COLUMN moderator_action_topic_slugs.topic_slug IS 'Topic slug captured at tag time.';

-- Current indexes for fresh schema bootstrap.
CREATE INDEX IF NOT EXISTS idx_moderator_actions__community_application_id
  ON moderator_actions (community_application_id)
  WHERE community_application_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_moderator_actions__post_id
  ON moderator_actions (post_id)
  WHERE post_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_moderator_actions__report_id
  ON moderator_actions (report_id)
  WHERE report_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_moderator_actions__review_dispute_id
  ON moderator_actions (review_dispute_id)
  WHERE review_dispute_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_moderator_actions__target_user_id
  ON moderator_actions (target_user_id)
  WHERE target_user_id IS NOT NULL;
