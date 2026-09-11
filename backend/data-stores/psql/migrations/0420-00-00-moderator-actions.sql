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
  moderation_transparency_community_id uuid,
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
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  -- Note: no num_nonnulls >= 1 CHECK here — ON DELETE SET NULL on FK columns could
  -- null out the only target reference and cause the CHECK to block hard-deletes.
  CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_moderator_actions__community__id
  ON moderator_actions (community_id, id DESC);

CREATE INDEX IF NOT EXISTS idx_moderator_actions__id
  ON moderator_actions (id DESC);

CREATE INDEX IF NOT EXISTS idx_moderator_actions__actor__id
  ON moderator_actions (actor_id, id DESC);

COMMENT ON TABLE moderator_actions IS 'Append-only unified log of moderator/admin actions.';

COMMENT ON COLUMN moderator_actions.community_id IS 'Community scope; NULL for global/platform-level actions.';
COMMENT ON COLUMN moderator_actions.moderation_transparency_community_id IS 'Immutable community scope stamped at action creation for global-transparency exclusion.';

COMMENT ON COLUMN moderator_actions.actor_id IS 'Moderator/admin who took the action (ON DELETE SET NULL for audit persistence).';

COMMENT ON COLUMN moderator_actions.action_type IS 'Type of moderation action taken.';

COMMENT ON COLUMN moderator_actions.post_id IS 'Target post or comment (ON DELETE SET NULL for audit persistence).';

COMMENT ON COLUMN moderator_actions.target_user_id IS 'Target user for bans, suspensions, warnings, member actions.';

COMMENT ON COLUMN moderator_actions.report_id IS 'Target moderation report for resolve/dismiss actions.';

COMMENT ON COLUMN moderator_actions.review_dispute_id IS 'Target review dispute for dispute-resolution actions.';

COMMENT ON COLUMN moderator_actions.community_application_id IS 'Target community application for approve/reject actions.';

COMMENT ON COLUMN moderator_actions.reason IS 'Optional free-text reason for the action.';

COMMENT ON COLUMN moderator_actions.metadata IS 'Structured context snapshot (e.g. role change target role, topic slugs for tags).';
