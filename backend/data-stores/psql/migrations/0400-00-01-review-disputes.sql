-- Coalesced pre-launch domain baseline.
-- edited-in-place: pre-launch, never deployed to production
-- Merged from: 0400-00-02-post-dispute-annotations.sql
DO $$
BEGIN
  CREATE TYPE review_dispute_reason AS ENUM (
    'factually_inaccurate',
    'defamatory',
    'impersonation',
    'privacy_violation',
    'other'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  CREATE TYPE review_dispute_action AS ENUM ('no_action', 'remove', 'annotate', 'dismiss');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  CREATE TYPE review_dispute_lifecycle_change_types AS ENUM (
    'create',
    'ai_draft',
    'edit',
    'approve',
    'send',
    'resolve_remove',
    'resolve_annotate',
    'dismiss'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

CREATE TABLE IF NOT EXISTS review_disputes (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  post_id uuid NOT NULL REFERENCES posts (id) ON DELETE CASCADE,
  topic_id uuid NOT NULL REFERENCES topics (id) ON DELETE CASCADE,
  disputed_rating smallint NOT NULL CHECK (disputed_rating BETWEEN 1 AND 5),
  disputant_user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  reason review_dispute_reason NOT NULL,
  claim_text text NOT NULL CHECK (char_length(claim_text) <= 4000),

  -- AI draft columns (nullable until agent runs)
  recommended_action review_dispute_action,
  ai_public_response text,
  ai_internal_response text,
  model text,
  ai_drafted_at timestamptz,

  -- Human-owned outbound message (the ONLY thing ever delivered to the disputant)
  public_response text,
  internal_notes text,

  -- Human-in-the-loop lifecycle (mirrors support_messages)
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
  resolution_action review_dispute_action,

  -- guardrails-disable-next-line uuid-must-be-key
  latest_lifecycle_change_id uuid,

  created_at timestamptz GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Queue pagination index
CREATE INDEX IF NOT EXISTS idx_review_disputes__status_created
  ON review_disputes (resolved_at, id DESC);

-- One open dispute per (disputant, review post, rated topic)
CREATE UNIQUE INDEX IF NOT EXISTS idx_review_disputes__one_open_per_disputant_topic
  ON review_disputes (disputant_user_id, post_id, topic_id)
  WHERE resolved_at IS NULL;

-- Fast lookup for annotation/badge on post detail
CREATE INDEX IF NOT EXISTS idx_review_disputes__post_id
  ON review_disputes (post_id);

-- FK-backing indexes
CREATE INDEX IF NOT EXISTS idx_review_disputes__topic_id ON review_disputes (topic_id);
CREATE INDEX IF NOT EXISTS idx_review_disputes__disputant ON review_disputes (disputant_user_id, id DESC);

CREATE OR REPLACE TRIGGER trigger_review_disputes_updated_at
  BEFORE UPDATE ON review_disputes
  FOR EACH ROW
  EXECUTE FUNCTION fn_update_updated_at();

CREATE OR REPLACE FUNCTION fn_guard_review_dispute_subject_snapshot()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.post_id IS DISTINCT FROM NEW.post_id
    OR OLD.topic_id IS DISTINCT FROM NEW.topic_id
    OR OLD.disputed_rating IS DISTINCT FROM NEW.disputed_rating THEN
    RAISE EXCEPTION 'review dispute subject snapshot cannot change'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER trigger_review_disputes_guard_subject_snapshot
  BEFORE UPDATE OF post_id, topic_id, disputed_rating ON review_disputes
  FOR EACH ROW
  EXECUTE FUNCTION fn_guard_review_dispute_subject_snapshot();

-- Append-only audit/lifecycle log
CREATE TABLE IF NOT EXISTS review_dispute_lifecycle_changes (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  review_dispute_id uuid NOT NULL REFERENCES review_disputes (id) ON DELETE CASCADE,
  change_type review_dispute_lifecycle_change_types NOT NULL,
  -- guardrails-disable-next-line uuid-must-be-key
  changed_by_id uuid REFERENCES users (id) ON DELETE SET NULL,
  -- Snapshot columns for audit
  drafted_at timestamptz,
  edited_at timestamptz,
  approved_at timestamptz,
  sent_at timestamptz,
  resolved_at timestamptz,
  resolution_action review_dispute_action,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL
);

CREATE INDEX IF NOT EXISTS idx_review_dispute_lifecycle__dispute_created
  ON review_dispute_lifecycle_changes (review_dispute_id, id DESC);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_review_disputes_latest_lifecycle_change_id'
  ) THEN
    ALTER TABLE review_disputes
      ADD CONSTRAINT fk_review_disputes_latest_lifecycle_change_id
      FOREIGN KEY (latest_lifecycle_change_id)
      REFERENCES review_dispute_lifecycle_changes(id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_review_disputes__latest_lifecycle_change_id
  ON review_disputes (latest_lifecycle_change_id)
  WHERE latest_lifecycle_change_id IS NOT NULL;

ALTER TABLE notifications
  DROP CONSTRAINT IF EXISTS fk_notifications__review_dispute_id;

ALTER TABLE notifications
  ADD CONSTRAINT fk_notifications__review_dispute_id
    FOREIGN KEY (review_dispute_id)
    REFERENCES review_disputes(id)
    ON DELETE SET NULL
    NOT VALID;

ALTER TABLE notifications
  VALIDATE CONSTRAINT fk_notifications__review_dispute_id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications__user_id__review_dispute
ON notifications (user_id, review_dispute_id)
WHERE review_dispute_id IS NOT NULL
  AND deleted_at IS NULL
  AND delivery_type = 'subscription';

CREATE INDEX IF NOT EXISTS idx_notifications__review_dispute
ON notifications (review_dispute_id)
WHERE review_dispute_id IS NOT NULL AND deleted_at IS NULL;

COMMENT ON TABLE review_disputes IS 'Disputes filed by verified topic claimants against reviews of their topic. Goes through a public moderation queue with AI-assisted draft resolution; all messaging is human-approved before delivery.';
COMMENT ON COLUMN review_disputes.post_id IS 'The disputed review post.';
COMMENT ON COLUMN review_disputes.topic_id IS 'The topic the disputed review rates (the claimant''s topic).';
COMMENT ON COLUMN review_disputes.disputed_rating IS 'Immutable snapshot of the topic rating when the dispute was filed.';
COMMENT ON COLUMN review_disputes.disputant_user_id IS 'The verified topic claimant who filed the dispute.';
COMMENT ON COLUMN review_disputes.reason IS 'Legal-angle reason for the dispute.';
COMMENT ON COLUMN review_disputes.claim_text IS 'The disputant''s explanation of their claim.';
COMMENT ON COLUMN review_disputes.recommended_action IS 'AI-recommended action (set by the dispute-resolution agent).';
COMMENT ON COLUMN review_disputes.ai_public_response IS 'AI-drafted public response (never delivered directly; human must edit and approve).';
COMMENT ON COLUMN review_disputes.ai_internal_response IS 'AI-drafted internal reasoning for moderators.';
COMMENT ON COLUMN review_disputes.public_response IS 'Human-owned public message. The ONLY field ever delivered to the disputant.';
COMMENT ON COLUMN review_disputes.approved_at IS 'When a moderator approved the public_response for delivery.';
COMMENT ON COLUMN review_disputes.sent_at IS 'When the approved public_response was delivered to the disputant.';
COMMENT ON COLUMN review_disputes.model IS 'OpenAI model used for the AI draft.';
COMMENT ON COLUMN review_disputes.ai_drafted_at IS 'When the AI agent drafted the recommended_action and ai_public_response.';
COMMENT ON COLUMN review_disputes.internal_notes IS 'Internal moderator notes, never shared with the disputant.';
COMMENT ON COLUMN review_disputes.drafted_at IS 'When the moderator first seeded public_response from the AI draft.';
COMMENT ON COLUMN review_disputes.edited_at IS 'When the moderator last edited public_response.';
COMMENT ON COLUMN review_disputes.edited_by_id IS 'Moderator who last edited the draft public_response.';
COMMENT ON COLUMN review_disputes.approved_by_id IS 'Moderator who approved the public_response for delivery.';
COMMENT ON COLUMN review_disputes.resolved_at IS 'When the dispute was resolved or dismissed.';
COMMENT ON COLUMN review_disputes.resolved_by_id IS 'Moderator who resolved or dismissed the dispute.';
COMMENT ON COLUMN review_disputes.resolution_action IS 'Final action taken to resolve the dispute.';
COMMENT ON COLUMN review_disputes.latest_lifecycle_change_id IS 'Denormalized pointer to the most recent lifecycle change row for this dispute.';

COMMENT ON COLUMN review_dispute_lifecycle_changes.review_dispute_id IS 'The dispute this lifecycle change belongs to.';
COMMENT ON COLUMN review_dispute_lifecycle_changes.change_type IS 'The type of state transition recorded by this change row.';
COMMENT ON COLUMN review_dispute_lifecycle_changes.changed_by_id IS 'The user who performed the action; NULL for system actions.';
COMMENT ON COLUMN review_dispute_lifecycle_changes.drafted_at IS 'Snapshot of drafted_at at the time of this change.';
COMMENT ON COLUMN review_dispute_lifecycle_changes.edited_at IS 'Snapshot of edited_at at the time of this change.';
COMMENT ON COLUMN review_dispute_lifecycle_changes.approved_at IS 'Snapshot of approved_at at the time of this change.';
COMMENT ON COLUMN review_dispute_lifecycle_changes.sent_at IS 'Snapshot of sent_at at the time of this change.';
COMMENT ON COLUMN review_dispute_lifecycle_changes.resolved_at IS 'Snapshot of resolved_at at the time of this change.';
COMMENT ON COLUMN review_dispute_lifecycle_changes.resolution_action IS 'Snapshot of resolution_action at the time of this change.';
COMMENT ON COLUMN review_dispute_lifecycle_changes.metadata IS 'Extra structured metadata for this lifecycle event (e.g. AI model, token counts).';

COMMENT ON TABLE review_dispute_lifecycle_changes IS 'Append-only audit log of state transitions for review disputes.';

CREATE TABLE IF NOT EXISTS post_dispute_annotations (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  post_id uuid NOT NULL REFERENCES posts (id) ON DELETE CASCADE,
  review_dispute_id uuid NOT NULL REFERENCES review_disputes (id) ON DELETE CASCADE,
  body_text text NOT NULL CHECK (char_length(body_text) > 0 AND char_length(body_text) <= 2000),
  created_by_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  removed_at timestamptz,
  -- guardrails-disable-next-line uuid-must-be-key
  removed_by_id uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at timestamptz GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL
);

-- At most one active annotation per dispute
CREATE UNIQUE INDEX IF NOT EXISTS idx_post_dispute_annotations__dispute_active
  ON post_dispute_annotations (review_dispute_id)
  WHERE removed_at IS NULL;

-- Fast render on review detail pages
CREATE INDEX IF NOT EXISTS idx_post_dispute_annotations__post_active
  ON post_dispute_annotations (post_id)
  WHERE removed_at IS NULL;

-- FK-backing
CREATE INDEX IF NOT EXISTS idx_post_dispute_annotations__created_by ON post_dispute_annotations (created_by_id);

COMMENT ON TABLE post_dispute_annotations IS 'Public, human-approved rebuttal annotations attached to reviewed posts as the outcome of a resolved review dispute. At most one active annotation per dispute.';
COMMENT ON COLUMN post_dispute_annotations.post_id IS 'The review post this annotation is attached to.';
COMMENT ON COLUMN post_dispute_annotations.review_dispute_id IS 'The resolved dispute that produced this annotation.';
COMMENT ON COLUMN post_dispute_annotations.body_text IS 'The human-authored, moderator-approved annotation text.';
COMMENT ON COLUMN post_dispute_annotations.created_by_id IS 'The moderator who created the annotation.';
COMMENT ON COLUMN post_dispute_annotations.removed_at IS 'When the annotation was retracted.';
COMMENT ON COLUMN post_dispute_annotations.removed_by_id IS 'Moderator who retracted the annotation.';
