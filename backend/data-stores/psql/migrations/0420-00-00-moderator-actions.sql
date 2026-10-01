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
    'dismiss_appeal',
    'topic_claim_verify',
    'topic_claim_reject',
    'topic_claim_revoke',
    'report_claim',
    'report_unclaim',
    'report_escalate',
    'report_deescalate',
    'report_integrity_flag_review',
    'report_integrity_penalty_apply',
    'report_integrity_penalty_revoke',
    'vote_integrity_flag_review',
    'vote_integrity_penalty_apply',
    'vote_integrity_penalty_revoke',
    'vote_weight_set',
    'vote_weight_reset',
    'agent_moderation_vote_set',
    'agent_moderation_vote_delete',
    'mod_note_delete',
    'report_judgement_rerun',
    'appeal_resolution_draft_rerun',
    'dispute_resolution_draft_rerun',
    'oauth_client_verify',
    'oauth_client_unverify',
    'crawler_create',
    'crawler_update',
    'crawler_delete',
    'rss_category_assign',
    'rss_category_reject',
    'rss_category_unreject',
    'queue_pause',
    'queue_resume',
    'queue_retry_failed',
    'scheduled_job_run',
    'backfill_run',
    'article_sync_run',
    'import_batch_create'
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
  topic_claim_id uuid REFERENCES topic_claims (id) ON DELETE SET NULL,
  report_integrity_flag_id uuid,
  report_abuse_penalty_id uuid,
  vote_integrity_flag_id uuid REFERENCES vote_integrity_flags (id) ON DELETE SET NULL,
  vote_weight_penalty_id uuid REFERENCES vote_weight_penalties (id) ON DELETE SET NULL,
  agent_moderation_id uuid,
  agent_moderation_post_id uuid,
  oauth_client_id uuid,
  user_mod_note_id uuid REFERENCES user_mod_notes (id) ON DELETE SET NULL,
  crawler_id uuid REFERENCES crawlers (id) ON DELETE SET NULL,
  topic_id uuid REFERENCES topics (id) ON DELETE SET NULL,
  operation_request_id uuid REFERENCES moderator_actions (id) ON DELETE SET NULL,
  queue_name text,
  scheduled_job_key text,
  backfill_key text,
  rss_category_text text,
  admin_import_batch_id uuid REFERENCES admin_import_batches (id) ON DELETE SET NULL,
  reason text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  -- Note: no num_nonnulls >= 1 CHECK here — ON DELETE SET NULL on FK columns could
  -- null out the only target reference and cause the CHECK to block hard-deletes.
  CHECK (jsonb_typeof(metadata) = 'object'),
  FOREIGN KEY (agent_moderation_post_id, agent_moderation_id)
    REFERENCES agent_moderations (post_id, id) ON DELETE SET NULL,
  CHECK ((agent_moderation_id IS NULL) = (agent_moderation_post_id IS NULL))
);

CREATE INDEX IF NOT EXISTS idx_moderator_actions__community__id
  ON moderator_actions (community_id, id DESC);

CREATE INDEX IF NOT EXISTS idx_moderator_actions__id
  ON moderator_actions (id DESC);

CREATE INDEX IF NOT EXISTS idx_moderator_actions__actor__id
  ON moderator_actions (actor_id, id DESC);

CREATE INDEX IF NOT EXISTS idx_moderator_actions__agent_moderation_target
  ON moderator_actions (agent_moderation_post_id, agent_moderation_id);

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

COMMENT ON COLUMN moderator_actions.topic_claim_id IS 'Target topic ownership claim for verification, rejection, or revocation.';
COMMENT ON COLUMN moderator_actions.report_integrity_flag_id IS 'Target report-integrity flag whose review was changed.';
COMMENT ON COLUMN moderator_actions.report_abuse_penalty_id IS 'Target report-abuse penalty applied or revoked.';
COMMENT ON COLUMN moderator_actions.vote_integrity_flag_id IS 'Target vote-integrity flag whose review was changed.';
COMMENT ON COLUMN moderator_actions.vote_weight_penalty_id IS 'Target vote-weight penalty applied or revoked.';
COMMENT ON COLUMN moderator_actions.agent_moderation_id IS 'Target agent moderation whose staff vote was changed; paired with its post owner.';
COMMENT ON COLUMN moderator_actions.agent_moderation_post_id IS 'Post owner required by the partitioned agent-moderation target foreign key.';
COMMENT ON COLUMN moderator_actions.oauth_client_id IS 'Target OAuth client whose verification was changed.';
COMMENT ON COLUMN moderator_actions.user_mod_note_id IS 'Target staff note retained after soft deletion.';
COMMENT ON COLUMN moderator_actions.crawler_id IS 'Target crawler created, edited, or deleted by staff.';
COMMENT ON COLUMN moderator_actions.topic_id IS 'Target editorial topic assigned to an RSS category.';
COMMENT ON COLUMN moderator_actions.operation_request_id IS 'Requested audit row linked by an external-operation outcome; an absent outcome remains unresolved.';
COMMENT ON COLUMN moderator_actions.queue_name IS 'Queue selected for a staff control operation.';
COMMENT ON COLUMN moderator_actions.scheduled_job_key IS 'Scheduled-job catalog key selected for an immediate staff run.';
COMMENT ON COLUMN moderator_actions.backfill_key IS 'Backfill catalog key selected for an immediate staff run.';
COMMENT ON COLUMN moderator_actions.rss_category_text IS 'RSS category text whose editorial assignment or rejection was changed.';
COMMENT ON COLUMN moderator_actions.admin_import_batch_id IS 'Target import batch created by a staff member.';

COMMENT ON COLUMN moderator_actions.reason IS 'Optional free-text reason for the action.';

COMMENT ON COLUMN moderator_actions.metadata IS 'Structured context snapshot (e.g. role change target role, topic slugs for tags).';

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

CREATE INDEX IF NOT EXISTS idx_moderator_actions__topic_claim_id
  ON moderator_actions (topic_claim_id) WHERE topic_claim_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_moderator_actions__report_integrity_flag_id
  ON moderator_actions (report_integrity_flag_id) WHERE report_integrity_flag_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_moderator_actions__report_abuse_penalty_id
  ON moderator_actions (report_abuse_penalty_id) WHERE report_abuse_penalty_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_moderator_actions__vote_integrity_flag_id
  ON moderator_actions (vote_integrity_flag_id) WHERE vote_integrity_flag_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_moderator_actions__vote_weight_penalty_id
  ON moderator_actions (vote_weight_penalty_id) WHERE vote_weight_penalty_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_moderator_actions__agent_moderation_id
  ON moderator_actions (agent_moderation_id) WHERE agent_moderation_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_moderator_actions__oauth_client_id
  ON moderator_actions (oauth_client_id) WHERE oauth_client_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_moderator_actions__user_mod_note_id
  ON moderator_actions (user_mod_note_id) WHERE user_mod_note_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_moderator_actions__crawler_id
  ON moderator_actions (crawler_id) WHERE crawler_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_moderator_actions__topic_id
  ON moderator_actions (topic_id) WHERE topic_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_moderator_actions__operation_request_id
  ON moderator_actions (operation_request_id) WHERE operation_request_id IS NOT NULL;


CREATE INDEX IF NOT EXISTS idx_moderator_actions__admin_import_batch_id
  ON moderator_actions (admin_import_batch_id) WHERE admin_import_batch_id IS NOT NULL;
