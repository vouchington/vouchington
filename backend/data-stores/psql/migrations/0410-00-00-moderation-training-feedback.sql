-- edited-in-place: pre-launch, never deployed to production
DO $$
BEGIN
  CREATE TYPE moderation_training_source_type AS ENUM (
    'agent_moderation',
    'openai_omni',
    'spam_detection',
    'community_prompt',
    'community_review',
    'moderation_report',
    'moderation_appeal',
    'review_dispute',
    'agent_moderation_vote',
    'prompt_test_run'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  CREATE TYPE moderation_training_event_type AS ENUM (
    'automod_reviewed',
    'manual_action_inferred',
    'report_resolved',
    'dispute_resolved',
    'appeal_resolved',
    'draft_edited',
    'agent_accuracy_voted',
    'prompt_test_labelled'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  CREATE TYPE moderation_training_label AS ENUM (
    'true_positive',
    'false_positive',
    'false_negative_candidate',
    'true_negative',
    'accepted',
    'edited',
    'rejected',
    'not_applicable'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

CREATE TABLE IF NOT EXISTS moderation_training_feedbacks (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  source_type moderation_training_source_type NOT NULL,
  event_type moderation_training_event_type NOT NULL,
  label moderation_training_label NOT NULL,
  human_action TEXT NOT NULL CHECK (human_action = TRIM(human_action) AND char_length(human_action) <= 120),
  reason_code TEXT CHECK (reason_code IS NULL OR (reason_code = TRIM(reason_code) AND char_length(reason_code) <= 120)),
  note TEXT CHECK (note IS NULL OR char_length(note) <= 2000),
  label_confidence DOUBLE PRECISION NOT NULL DEFAULT 1 CHECK (label_confidence >= 0 AND label_confidence <= 1),

  actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  community_id UUID REFERENCES communities(id) ON DELETE CASCADE,
  post_id UUID REFERENCES posts(id) ON DELETE CASCADE,
  agent_moderation_id UUID,
  moderation_report_id UUID REFERENCES moderation_reports(id) ON DELETE CASCADE,
  moderation_appeal_id UUID,
  review_dispute_id UUID REFERENCES review_disputes(id) ON DELETE SET NULL,
  post_clearance_change_id UUID REFERENCES post_clearance_changes(id) ON DELETE SET NULL,

  input_sha256 BYTEA CHECK (input_sha256 IS NULL OR octet_length(input_sha256) = 32),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (post_id, agent_moderation_id)
    REFERENCES agent_moderations(post_id, id)
    ON DELETE CASCADE,
  CONSTRAINT chk_moderation_training_feedbacks__targets CHECK (
    (source_type <> 'prompt_test_run' OR post_id IS NULL)
    AND (
      source_type IN ('prompt_test_run', 'moderation_report', 'moderation_appeal')
      OR post_id IS NOT NULL
    )
    AND (agent_moderation_id IS NOT NULL) = (
      source_type IN ('agent_moderation', 'community_prompt', 'agent_moderation_vote')
    )
    AND (moderation_report_id IS NOT NULL) = (source_type = 'moderation_report')
    AND (moderation_appeal_id IS NOT NULL) = (source_type = 'moderation_appeal')
    AND (review_dispute_id IS NOT NULL) = (source_type = 'review_dispute')
    AND (post_clearance_change_id IS NULL OR source_type = 'community_review')
  )
);

CREATE OR REPLACE TRIGGER trigger_moderation_training_feedbacks_updated_at
  BEFORE UPDATE ON moderation_training_feedbacks
  FOR EACH ROW
  EXECUTE FUNCTION fn_update_updated_at();

CREATE INDEX IF NOT EXISTS idx_moderation_training_feedbacks__community_id
  ON moderation_training_feedbacks (community_id, id DESC);

CREATE INDEX IF NOT EXISTS idx_moderation_training_feedbacks__post_id
  ON moderation_training_feedbacks (post_id, id DESC);

CREATE INDEX IF NOT EXISTS idx_moderation_training_feedbacks__agent_moderation_id
  ON moderation_training_feedbacks (agent_moderation_id, id DESC)
  WHERE agent_moderation_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_moderation_training_feedbacks__source
  ON moderation_training_feedbacks (source_type, event_type, id DESC);

COMMENT ON TABLE moderation_training_feedbacks IS 'Human moderation feedback events used to build agent training and evaluation datasets.';
COMMENT ON COLUMN moderation_training_feedbacks.source_type IS 'Which moderation workflow produced the candidate example.';
COMMENT ON COLUMN moderation_training_feedbacks.event_type IS 'Which human or automated moderation event generated this label.';
COMMENT ON COLUMN moderation_training_feedbacks.label IS 'Normalized training label inferred from the human moderation action.';
COMMENT ON COLUMN moderation_training_feedbacks.human_action IS 'Concrete moderator action, e.g. reinstate, keep_removed, approve, reject, dismiss.';
COMMENT ON COLUMN moderation_training_feedbacks.reason_code IS 'Optional normalized reason chip selected by a moderator.';
COMMENT ON COLUMN moderation_training_feedbacks.note IS 'Optional moderator note for dataset curation.';
COMMENT ON COLUMN moderation_training_feedbacks.label_confidence IS 'Confidence in the inferred human label; explicit feedback should use 1.';
COMMENT ON COLUMN moderation_training_feedbacks.actor_user_id IS 'Human actor who produced the feedback event, if known.';
COMMENT ON COLUMN moderation_training_feedbacks.community_id IS 'Community context where the moderation feedback was produced.';
COMMENT ON COLUMN moderation_training_feedbacks.post_id IS 'Post or comment that the moderation feedback labels.';
COMMENT ON COLUMN moderation_training_feedbacks.agent_moderation_id IS 'Agent moderation result that produced the candidate example.';
COMMENT ON COLUMN moderation_training_feedbacks.moderation_report_id IS 'Moderation report whose resolution produced this feedback.';
COMMENT ON COLUMN moderation_training_feedbacks.moderation_appeal_id IS 'Moderation appeal whose resolution produced this feedback.';
COMMENT ON COLUMN moderation_training_feedbacks.review_dispute_id IS 'Review dispute whose resolution produced this feedback.';
COMMENT ON COLUMN moderation_training_feedbacks.post_clearance_change_id IS 'Post clearance state change associated with this feedback.';
COMMENT ON COLUMN moderation_training_feedbacks.input_sha256 IS 'Optional SHA-256 digest for the moderated input text.';
COMMENT ON COLUMN moderation_training_feedbacks.metadata IS 'Structured model outputs, prompt/version references, and export hints.';
