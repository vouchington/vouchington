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
  metadata_source_key TEXT,
  metadata_outcome TEXT,
  metadata_source_type TEXT,
  metadata_score DOUBLE PRECISION,
  metadata_score_present BOOLEAN NOT NULL DEFAULT FALSE,
  metadata_recommended_action TEXT,
  metadata_reason TEXT,
  metadata_report_entity_type TEXT,
  metadata_report_reason TEXT,
  metadata_report_post_id UUID REFERENCES retained_post_identities (id) ON DELETE RESTRICT,
  metadata_report_user_id UUID REFERENCES retained_user_identities (id) ON DELETE RESTRICT,
  metadata_report_hostname_id UUID REFERENCES retained_url_hostname_identities (id) ON DELETE RESTRICT,
  metadata_report_rss_feed_item_id UUID REFERENCES retained_rss_feed_item_identities (id) ON DELETE RESTRICT,
  metadata_community_trusted BOOLEAN,
  metadata_community_trusted_present BOOLEAN NOT NULL DEFAULT FALSE,
  metadata_clearance_status TEXT,
  metadata_prompt_id UUID REFERENCES retained_community_agent_prompt_identities (id) ON DELETE RESTRICT,
  metadata_prompt_model_name TEXT,
  metadata_prompt_model_provider TEXT,
  metadata_test_text TEXT,
  metadata_expected_flagged BOOLEAN,
  metadata_expected_flagged_present BOOLEAN NOT NULL DEFAULT FALSE,
  metadata_expected_reason TEXT,
  metadata_actual_flagged BOOLEAN,
  metadata_actual_flagged_present BOOLEAN NOT NULL DEFAULT FALSE,
  metadata_actual_reason TEXT,
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
  ),
  CONSTRAINT chk_moderation_training_feedbacks__report_target CHECK (
    metadata_report_entity_type IS NULL
    OR (
      num_nonnulls(
        metadata_report_post_id,
        metadata_report_user_id,
        metadata_report_hostname_id,
        metadata_report_rss_feed_item_id
      ) = 1
      AND (
        (metadata_report_entity_type IN ('post', 'comment') AND metadata_report_post_id IS NOT NULL)
        OR (metadata_report_entity_type = 'user' AND metadata_report_user_id IS NOT NULL)
        OR (metadata_report_entity_type = 'url_hostname' AND metadata_report_hostname_id IS NOT NULL)
        OR (metadata_report_entity_type = 'rss_feed_item' AND metadata_report_rss_feed_item_id IS NOT NULL)
      )
    )
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
COMMENT ON COLUMN moderation_training_feedbacks.metadata_source_key IS 'Automod source key captured with the feedback event.';
COMMENT ON COLUMN moderation_training_feedbacks.metadata_outcome IS 'Automod review outcome captured with the feedback event.';
COMMENT ON COLUMN moderation_training_feedbacks.metadata_source_type IS 'Automod source type captured with the feedback event.';
COMMENT ON COLUMN moderation_training_feedbacks.metadata_score IS 'Agent accuracy vote score when metadata_score_present is true. Null can be an explicit score.';
COMMENT ON COLUMN moderation_training_feedbacks.metadata_score_present IS 'True when the feedback event included a score key.';
COMMENT ON COLUMN moderation_training_feedbacks.metadata_recommended_action IS 'Recommended action captured from an appeal or dispute resolution.';
COMMENT ON COLUMN moderation_training_feedbacks.metadata_reason IS 'Dispute reason captured with resolution feedback.';
COMMENT ON COLUMN moderation_training_feedbacks.metadata_report_entity_type IS 'Report target family captured with report-resolution feedback.';
COMMENT ON COLUMN moderation_training_feedbacks.metadata_report_reason IS 'Report reason captured with report-resolution feedback.';
COMMENT ON COLUMN moderation_training_feedbacks.metadata_report_post_id IS 'Retained post identity when the captured report target is a post or comment.';
COMMENT ON COLUMN moderation_training_feedbacks.metadata_report_user_id IS 'Retained user identity when the captured report target is a user.';
COMMENT ON COLUMN moderation_training_feedbacks.metadata_report_hostname_id IS 'Retained hostname identity when the captured report target is a hostname.';
COMMENT ON COLUMN moderation_training_feedbacks.metadata_report_rss_feed_item_id IS 'Retained RSS item identity when the captured report target is an RSS item.';
COMMENT ON COLUMN moderation_training_feedbacks.metadata_community_trusted IS 'Whether the community was trusted when publication feedback was recorded.';
COMMENT ON COLUMN moderation_training_feedbacks.metadata_community_trusted_present IS 'True when publication feedback included community_trusted.';
COMMENT ON COLUMN moderation_training_feedbacks.metadata_clearance_status IS 'Clearance status captured with manual clearance feedback.';
COMMENT ON COLUMN moderation_training_feedbacks.metadata_prompt_id IS 'Retained community prompt identity for a saved prompt test. It does not authorize the prompt.';
COMMENT ON COLUMN moderation_training_feedbacks.metadata_prompt_model_name IS 'Prompt model name captured with a saved prompt test.';
COMMENT ON COLUMN moderation_training_feedbacks.metadata_prompt_model_provider IS 'Prompt model provider captured with a saved prompt test.';
COMMENT ON COLUMN moderation_training_feedbacks.metadata_test_text IS 'Prompt test text saved for training.';
COMMENT ON COLUMN moderation_training_feedbacks.metadata_expected_flagged IS 'Expected flagged result of a saved prompt test.';
COMMENT ON COLUMN moderation_training_feedbacks.metadata_expected_flagged_present IS 'True when a saved prompt test included expected_flagged.';
COMMENT ON COLUMN moderation_training_feedbacks.metadata_expected_reason IS 'Expected reason of a saved prompt test.';
COMMENT ON COLUMN moderation_training_feedbacks.metadata_actual_flagged IS 'Actual flagged result of a saved prompt test.';
COMMENT ON COLUMN moderation_training_feedbacks.metadata_actual_flagged_present IS 'True when a saved prompt test included actual_flagged.';
COMMENT ON COLUMN moderation_training_feedbacks.metadata_actual_reason IS 'Actual reason of a saved prompt test.';

CREATE INDEX IF NOT EXISTS idx_moderation_training_feedbacks__report_post_id
  ON moderation_training_feedbacks (metadata_report_post_id) WHERE metadata_report_post_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_moderation_training_feedbacks__report_user_id
  ON moderation_training_feedbacks (metadata_report_user_id) WHERE metadata_report_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_moderation_training_feedbacks__report_hostname_id
  ON moderation_training_feedbacks (metadata_report_hostname_id) WHERE metadata_report_hostname_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_moderation_training_feedbacks__report_rss_item_id
  ON moderation_training_feedbacks (metadata_report_rss_feed_item_id) WHERE metadata_report_rss_feed_item_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_moderation_training_feedbacks__prompt_id
  ON moderation_training_feedbacks (metadata_prompt_id) WHERE metadata_prompt_id IS NOT NULL;

-- Current indexes for fresh schema bootstrap.
CREATE INDEX IF NOT EXISTS idx_moderation_training_feedbacks__actor_user_id
  ON moderation_training_feedbacks (actor_user_id)
  WHERE actor_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_moderation_training_feedbacks__moderation_report_id
  ON moderation_training_feedbacks (moderation_report_id)
  WHERE moderation_report_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_moderation_training_feedbacks__post_clearance_change_id
  ON moderation_training_feedbacks (post_clearance_change_id)
  WHERE post_clearance_change_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_moderation_training_feedbacks__review_dispute_id
  ON moderation_training_feedbacks (review_dispute_id)
  WHERE review_dispute_id IS NOT NULL;
