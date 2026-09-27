-- Moderation appeals: users can appeal moderation actions (warnings, bans, post removals).
-- edited-in-place: pre-launch, never deployed to production
DO $$
BEGIN
  CREATE TYPE moderation_appeal_action AS ENUM ('accept', 'deny', 'reduce');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  CREATE TYPE moderation_appeal_post_removal_kinds AS ENUM ('platform', 'community');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  CREATE TYPE moderation_appeal_lifecycle_change_types AS ENUM (
    'create',
    'ai_draft',
    'edit',
    'approve',
    'send',
    'resolve_accept',
    'resolve_deny',
    'resolve_reduce',
    'dismiss'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

CREATE TABLE IF NOT EXISTS moderation_appeals (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  created_via content_creation_channels,
  created_via_oauth_client_id UUID,
  CONSTRAINT moderation_appeals_created_via_oauth_client_id_check CHECK (created_via_oauth_client_id IS NULL OR (created_via IS NOT NULL AND created_via IN ('api', 'mcp'))),
  appellant_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,

  -- Exactly one of these must be non-null (the thing being appealed)
  -- guardrails-disable-next-line uuid-must-be-key
  user_warning_id uuid REFERENCES user_warnings (id) ON DELETE CASCADE,
  -- guardrails-disable-next-line uuid-must-be-key
  community_ban_id uuid REFERENCES community_bans (id) ON DELETE CASCADE,
  -- guardrails-disable-next-line uuid-must-be-key
  post_id uuid REFERENCES posts (id) ON DELETE CASCADE,
  -- guardrails-disable-next-line uuid-must-be-key
  user_suspension_id uuid,
  CHECK (num_nonnulls(user_warning_id, community_ban_id, post_id, user_suspension_id) = 1),

  -- Community scope (from the target action; NULL for global/platform-level)
  -- guardrails-disable-next-line uuid-must-be-key
  community_id uuid REFERENCES communities (id) ON DELETE SET NULL,
  moderation_transparency_community_id uuid,

  -- Discriminates between platform-clearance and community-unpublish post appeals
  post_removal_kind moderation_appeal_post_removal_kinds,
  CONSTRAINT chk_moderation_appeals__post_removal_kind_scope CHECK (
    (post_id IS NOT NULL AND post_removal_kind IS NOT NULL)
    OR (post_id IS NULL AND post_removal_kind IS NULL)
  ),

  appeal_reason text NOT NULL CHECK (char_length(appeal_reason) <= 4000),

  -- AI draft columns (nullable until agent runs)
  recommended_action moderation_appeal_action,
  ai_public_response text,
  ai_internal_response text,
  model text,
  ai_drafted_at timestamptz,

  -- Human-owned outbound message
  public_response text,
  internal_notes text,

  -- Human-in-the-loop lifecycle
  drafted_at timestamptz,
  edited_at timestamptz,
  -- guardrails-disable-next-line uuid-must-be-key
  edited_by_id uuid REFERENCES users (id) ON DELETE SET NULL,
  approved_at timestamptz,
  -- guardrails-disable-next-line uuid-must-be-key
  approved_by_id uuid REFERENCES users (id) ON DELETE SET NULL,
  sent_at timestamptz,
  resolved_at timestamptz,
  -- guardrails-disable-next-line uuid-must-be-key
  resolved_by_id uuid REFERENCES users (id) ON DELETE SET NULL,
  resolution_action moderation_appeal_action,
  CONSTRAINT chk_moderation_appeals__resolution_pairing CHECK (
    (resolved_at IS NULL AND resolution_action IS NULL)
    OR (resolved_at IS NOT NULL AND resolution_action IS NOT NULL)
  ),

  -- guardrails-disable-next-line uuid-must-be-key
  latest_lifecycle_change_id uuid,

  -- guardrails-disable-next-line uuid-must-be-key
  case_id uuid NOT NULL REFERENCES moderation_cases (id) ON DELETE CASCADE,

  created_at timestamptz GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);



-- Queue pagination
CREATE INDEX IF NOT EXISTS idx_moderation_appeals__status_created
  ON moderation_appeals (resolved_at, id DESC);

-- One open appeal per (appellant, target) — partial unique indexes
CREATE UNIQUE INDEX IF NOT EXISTS idx_moderation_appeals__one_open_warning
  ON moderation_appeals (appellant_id, user_warning_id)
  WHERE resolved_at IS NULL AND user_warning_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_moderation_appeals__one_open_ban
  ON moderation_appeals (appellant_id, community_ban_id)
  WHERE resolved_at IS NULL AND community_ban_id IS NOT NULL;

DROP INDEX IF EXISTS idx_moderation_appeals__one_open_post;

CREATE UNIQUE INDEX IF NOT EXISTS idx_moderation_appeals__one_open_post
  ON moderation_appeals (appellant_id, post_id, post_removal_kind)
  WHERE resolved_at IS NULL AND post_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_moderation_appeals__one_open_suspension
  ON moderation_appeals (appellant_id, user_suspension_id)
  WHERE resolved_at IS NULL AND user_suspension_id IS NOT NULL;

-- FK-backing indexes
CREATE INDEX IF NOT EXISTS idx_moderation_appeals__user_warning
  ON moderation_appeals (user_warning_id)
  WHERE user_warning_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_moderation_appeals__community_ban
  ON moderation_appeals (community_ban_id)
  WHERE community_ban_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_moderation_appeals__post_id
  ON moderation_appeals (post_id)
  WHERE post_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_moderation_appeals__user_suspension_id
  ON moderation_appeals (user_suspension_id)
  WHERE user_suspension_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_moderation_appeals__appellant
  ON moderation_appeals (appellant_id, id DESC);

CREATE INDEX IF NOT EXISTS idx_moderation_appeals__community_id
  ON moderation_appeals (community_id)
  WHERE community_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_moderation_appeals__case_id
  ON moderation_appeals (case_id);

CREATE OR REPLACE TRIGGER trigger_moderation_appeals_updated_at
  BEFORE UPDATE ON moderation_appeals
  FOR EACH ROW
  EXECUTE FUNCTION fn_update_updated_at();

ALTER TABLE moderation_training_feedbacks
  DROP CONSTRAINT IF EXISTS fk_moderation_training_feedbacks__moderation_appeal_id;

ALTER TABLE moderation_training_feedbacks
  ADD CONSTRAINT fk_moderation_training_feedbacks__moderation_appeal_id
    FOREIGN KEY (moderation_appeal_id)
    REFERENCES moderation_appeals (id)
    ON DELETE CASCADE
    NOT VALID;

ALTER TABLE moderation_training_feedbacks
  VALIDATE CONSTRAINT fk_moderation_training_feedbacks__moderation_appeal_id;

CREATE INDEX IF NOT EXISTS idx_moderation_training_feedbacks__moderation_appeal_id
  ON moderation_training_feedbacks (moderation_appeal_id, id DESC)
  WHERE moderation_appeal_id IS NOT NULL;

-- Append-only audit/lifecycle log
CREATE TABLE IF NOT EXISTS moderation_appeal_lifecycle_changes (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  moderation_appeal_id uuid NOT NULL REFERENCES moderation_appeals (id) ON DELETE CASCADE,
  change_type moderation_appeal_lifecycle_change_types NOT NULL,
  -- guardrails-disable-next-line uuid-must-be-key
  changed_by_id uuid REFERENCES users (id) ON DELETE SET NULL,
  -- Snapshot columns for audit
  drafted_at timestamptz,
  edited_at timestamptz,
  approved_at timestamptz,
  sent_at timestamptz,
  resolved_at timestamptz,
  resolution_action moderation_appeal_action,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL
);

CREATE INDEX IF NOT EXISTS idx_moderation_appeal_lifecycle__appeal_created
  ON moderation_appeal_lifecycle_changes (moderation_appeal_id, id DESC);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_moderation_appeals_latest_lifecycle_change_id'
  ) THEN
    ALTER TABLE moderation_appeals
      ADD CONSTRAINT fk_moderation_appeals_latest_lifecycle_change_id
      FOREIGN KEY (latest_lifecycle_change_id)
      REFERENCES moderation_appeal_lifecycle_changes(id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_moderation_appeals__latest_lifecycle_change_id
  ON moderation_appeals (latest_lifecycle_change_id)
  WHERE latest_lifecycle_change_id IS NOT NULL;

-- Wire FK from notifications.moderation_appeal_id → moderation_appeals(id)
-- The column was added to notifications in place in 0120; this migration adds the FK.
ALTER TABLE notifications
  DROP CONSTRAINT IF EXISTS fk_notifications__moderation_appeal_id;

ALTER TABLE notifications
  ADD CONSTRAINT fk_notifications__moderation_appeal_id
    FOREIGN KEY (moderation_appeal_id)
    REFERENCES moderation_appeals (id)
    ON DELETE SET NULL
    NOT VALID;

ALTER TABLE notifications
  VALIDATE CONSTRAINT fk_notifications__moderation_appeal_id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications__user_id__moderation_appeal
  ON notifications (user_id, moderation_appeal_id)
  WHERE moderation_appeal_id IS NOT NULL
    AND deleted_at IS NULL
    AND delivery_type = 'subscription';

CREATE INDEX IF NOT EXISTS idx_notifications__moderation_appeal
  ON notifications (moderation_appeal_id)
  WHERE moderation_appeal_id IS NOT NULL AND deleted_at IS NULL;

-- Wire FK from notifications.community_ban_id → community_bans(id)
ALTER TABLE notifications
  DROP CONSTRAINT IF EXISTS fk_notifications__community_ban_id;

ALTER TABLE notifications
  ADD CONSTRAINT fk_notifications__community_ban_id
    FOREIGN KEY (community_ban_id)
    REFERENCES community_bans (id)
    ON DELETE SET NULL
    NOT VALID;

ALTER TABLE notifications
  VALIDATE CONSTRAINT fk_notifications__community_ban_id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications__user_id__community_ban
  ON notifications (user_id, community_ban_id)
  WHERE community_ban_id IS NOT NULL
    AND deleted_at IS NULL
    AND delivery_type = 'subscription';

CREATE INDEX IF NOT EXISTS idx_notifications__community_ban
  ON notifications (community_ban_id)
  WHERE community_ban_id IS NOT NULL AND deleted_at IS NULL;

-- Wire FK from moderator_actions.moderation_appeal_id → moderation_appeals(id)
-- The column was added to moderator_actions in place in 0420; this migration adds the FK.
ALTER TABLE moderator_actions
  DROP CONSTRAINT IF EXISTS fk_moderator_actions__moderation_appeal_id;

ALTER TABLE moderator_actions
  ADD CONSTRAINT fk_moderator_actions__moderation_appeal_id
    FOREIGN KEY (moderation_appeal_id)
    REFERENCES moderation_appeals (id)
    ON DELETE SET NULL
    NOT VALID;

ALTER TABLE moderator_actions
  VALIDATE CONSTRAINT fk_moderator_actions__moderation_appeal_id;

CREATE INDEX IF NOT EXISTS idx_moderator_actions__moderation_appeal_id
  ON moderator_actions (moderation_appeal_id)
  WHERE moderation_appeal_id IS NOT NULL;

COMMENT ON TABLE moderation_appeals IS 'Appeals filed by users against moderation actions (warnings, bans, post removals, platform suspensions). Goes through an AI-assisted draft + human-approval workflow before any response is delivered.';
COMMENT ON COLUMN moderation_appeals.appellant_id IS 'The user who filed the appeal.';
COMMENT ON COLUMN moderation_appeals.user_warning_id IS 'The warning being appealed; exactly one of user_warning_id, community_ban_id, post_id, user_suspension_id must be set.';
COMMENT ON COLUMN moderation_appeals.community_ban_id IS 'The ban being appealed; exactly one of user_warning_id, community_ban_id, post_id, user_suspension_id must be set.';
COMMENT ON COLUMN moderation_appeals.post_id IS 'The removed post being appealed; exactly one of user_warning_id, community_ban_id, post_id, user_suspension_id must be set.';
COMMENT ON COLUMN moderation_appeals.user_suspension_id IS 'The platform suspension being appealed; exactly one of user_warning_id, community_ban_id, post_id, user_suspension_id must be set.';
COMMENT ON COLUMN moderation_appeals.community_id IS 'Community scope; NULL for global/platform-level actions.';
COMMENT ON COLUMN moderation_appeals.moderation_transparency_community_id IS 'Immutable community scope stamped at appeal creation for global-transparency exclusion.';
COMMENT ON COLUMN moderation_appeals.post_removal_kind IS 'For post_id appeals: ''platform'' when appealing a clearance rejection, ''community'' when appealing a community unpublish.';
COMMENT ON COLUMN moderation_appeals.appeal_reason IS 'The appellant''s explanation of why they believe the action was incorrect.';
COMMENT ON COLUMN moderation_appeals.recommended_action IS 'AI-recommended action (set by the appeal-resolution agent).';
COMMENT ON COLUMN moderation_appeals.ai_public_response IS 'AI-drafted public response (never delivered directly; human must edit and approve).';
COMMENT ON COLUMN moderation_appeals.ai_internal_response IS 'AI-drafted internal reasoning for moderators.';
COMMENT ON COLUMN moderation_appeals.model IS 'OpenAI model used for the AI draft.';
COMMENT ON COLUMN moderation_appeals.ai_drafted_at IS 'When the AI agent drafted the recommended_action and responses.';
COMMENT ON COLUMN moderation_appeals.public_response IS 'Human-owned public message. The ONLY field ever delivered to the appellant.';
COMMENT ON COLUMN moderation_appeals.internal_notes IS 'Internal moderator notes, never shared with the appellant.';
COMMENT ON COLUMN moderation_appeals.drafted_at IS 'When the moderator first seeded public_response from the AI draft.';
COMMENT ON COLUMN moderation_appeals.edited_at IS 'When the moderator last edited public_response.';
COMMENT ON COLUMN moderation_appeals.edited_by_id IS 'Moderator who last edited the draft public_response.';
COMMENT ON COLUMN moderation_appeals.approved_at IS 'When a moderator approved the public_response for delivery.';
COMMENT ON COLUMN moderation_appeals.approved_by_id IS 'Moderator who approved the public_response for delivery.';
COMMENT ON COLUMN moderation_appeals.sent_at IS 'When the approved public_response was delivered to the appellant.';
COMMENT ON COLUMN moderation_appeals.resolved_at IS 'When the appeal was resolved or dismissed.';
COMMENT ON COLUMN moderation_appeals.resolved_by_id IS 'Moderator who resolved or dismissed the appeal.';
COMMENT ON COLUMN moderation_appeals.resolution_action IS 'Final action taken: accept (undo original), deny, or reduce.';
COMMENT ON COLUMN moderation_appeals.latest_lifecycle_change_id IS 'Denormalized pointer to the most recent lifecycle change row for this appeal.';
COMMENT ON COLUMN moderation_appeals.case_id IS 'The moderation case this appeal belongs to.';

COMMENT ON TABLE moderation_appeal_lifecycle_changes IS 'Append-only audit log of state transitions for moderation appeals.';
COMMENT ON COLUMN moderation_appeal_lifecycle_changes.moderation_appeal_id IS 'The appeal this lifecycle change belongs to.';
COMMENT ON COLUMN moderation_appeal_lifecycle_changes.change_type IS 'The type of state transition recorded by this change row.';
COMMENT ON COLUMN moderation_appeal_lifecycle_changes.changed_by_id IS 'The user who performed the action; NULL for system/AI actions.';
COMMENT ON COLUMN moderation_appeal_lifecycle_changes.drafted_at IS 'Snapshot of drafted_at at the time of this change.';
COMMENT ON COLUMN moderation_appeal_lifecycle_changes.edited_at IS 'Snapshot of edited_at at the time of this change.';
COMMENT ON COLUMN moderation_appeal_lifecycle_changes.approved_at IS 'Snapshot of approved_at at the time of this change.';
COMMENT ON COLUMN moderation_appeal_lifecycle_changes.sent_at IS 'Snapshot of sent_at at the time of this change.';
COMMENT ON COLUMN moderation_appeal_lifecycle_changes.resolved_at IS 'Snapshot of resolved_at at the time of this change.';
COMMENT ON COLUMN moderation_appeal_lifecycle_changes.resolution_action IS 'Snapshot of resolution_action at the time of this change.';
COMMENT ON COLUMN moderation_appeal_lifecycle_changes.metadata IS 'Extra structured metadata for this lifecycle event (e.g. AI model, token counts).';

COMMENT ON COLUMN moderator_actions.moderation_appeal_id IS 'Target moderation appeal for resolve_appeal/dismiss_appeal actions.';

COMMENT ON COLUMN notifications.moderation_appeal_id IS 'The moderation appeal this notification refers to; set when entity_type is moderation_appeal.';
COMMENT ON COLUMN notifications.community_ban_id IS 'The community ban this notification refers to; set when entity_type is community_ban.';

COMMENT ON COLUMN user_warnings.revoked_at IS 'When this warning was revoked (e.g. via appeal acceptance). NULL means the warning is still active.';
COMMENT ON COLUMN user_warnings.revoked_by_id IS 'The staff user who revoked this warning.';

CREATE INDEX IF NOT EXISTS idx_moderation_appeals__created_via_oauth_client_id
  ON moderation_appeals (created_via_oauth_client_id)
  WHERE created_via_oauth_client_id IS NOT NULL;
