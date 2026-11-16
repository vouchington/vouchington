-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TABLE copyright_notice_appeal_recommendations (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  copyright_notice_submission_id uuid NOT NULL CONSTRAINT fk_copyright_notice_appeal_recommendations__submission REFERENCES copyright_notice_submissions(id) ON DELETE RESTRICT,
  input_sha256 bytea NOT NULL CHECK (octet_length(input_sha256) = 32),
  prompt_version text NOT NULL CHECK (char_length(prompt_version) BETWEEN 1 AND 100),
  model text NOT NULL CHECK (char_length(model) BETWEEN 1 AND 255),
  recommendation copyright_notice_appeal_recommendation_outcomes NOT NULL CHECK (recommendation IN ('confirm', 'modify', 'reverse', 'uncertain')),
  rationale_ciphertext text NOT NULL CONSTRAINT chk_copyright_notice_appeal_recommendatio__rationale_ciphertext CHECK (char_length(rationale_ciphertext) BETWEEN 1 AND 1048576),
  created_at timestamptz GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,

  CONSTRAINT uq_cop_not_app_rec__submission_id__input_sha256__prompt_version UNIQUE (copyright_notice_submission_id, input_sha256, prompt_version)
);
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX idx_copyright_notice_appeal_recommendations__submission
  ON copyright_notice_appeal_recommendations (copyright_notice_submission_id, id DESC);
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TRIGGER trigger_copyright_appeal_recommendations_immutable BEFORE UPDATE OR DELETE ON copyright_notice_appeal_recommendations FOR EACH ROW EXECUTE FUNCTION fn_reject_copyright_notice_immutable_evidence();

COMMENT ON TABLE copyright_notice_appeal_recommendations IS 'Immutable advisory recommendations for a moderator evaluating an ordinary copyright appeal; never an authorization to alter material availability.';
COMMENT ON COLUMN copyright_notice_appeal_recommendations.copyright_notice_submission_id IS 'The immutable ordinary appeal receipt evaluated by the agent.';
COMMENT ON COLUMN copyright_notice_appeal_recommendations.input_sha256 IS 'Digest of the structured appeal and notice context supplied to the model.';
COMMENT ON COLUMN copyright_notice_appeal_recommendations.prompt_version IS 'Versioned advisory recommendation prompt.';
COMMENT ON COLUMN copyright_notice_appeal_recommendations.model IS 'Model identifier recorded for recommendation provenance.';
COMMENT ON COLUMN copyright_notice_appeal_recommendations.recommendation IS 'Bounded advisory disposition for a moderator; no worker acts on it.';
COMMENT ON COLUMN copyright_notice_appeal_recommendations.rationale_ciphertext IS 'Encrypted bounded agent rationale visible only to authorized staff.';

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TABLE copyright_notice_appeal_recommendation_runs (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  copyright_notice_submission_id uuid NOT NULL CONSTRAINT fk_copyright_notice_appeal_recommendation_runs__submission REFERENCES copyright_notice_submissions(id) ON DELETE RESTRICT,
  copyright_notice_appeal_recommendation_id uuid CONSTRAINT fk_copyright_notice_appeal_recommendation_runs__result REFERENCES copyright_notice_appeal_recommendations(id) ON DELETE RESTRICT,
  completed_at timestamptz,
  failed_at timestamptz,
  expired_at timestamptz,
  status copyright_notice_ai_run_statuses GENERATED ALWAYS AS (
    CASE WHEN completed_at IS NOT NULL THEN 'succeeded'::copyright_notice_ai_run_statuses
         WHEN failed_at IS NOT NULL THEN 'failed'::copyright_notice_ai_run_statuses
         WHEN expired_at IS NOT NULL THEN 'expired'::copyright_notice_ai_run_statuses
         ELSE 'active'::copyright_notice_ai_run_statuses END
  ) STORED,
  created_at timestamptz GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  CHECK ((completed_at IS NULL) = (copyright_notice_appeal_recommendation_id IS NULL)),
  CHECK (num_nonnulls(completed_at, failed_at, expired_at) <= 1)
);
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE UNIQUE INDEX uq_copyright_notice_appeal_recommendation_runs__active ON copyright_notice_appeal_recommendation_runs(copyright_notice_submission_id)
  WHERE completed_at IS NULL AND failed_at IS NULL AND expired_at IS NULL;
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX idx_copyright_notice_appeal_recommendation_runs__submission ON copyright_notice_appeal_recommendation_runs(copyright_notice_submission_id, id DESC);
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX idx_copyright_notice_appeal_recommendation_runs__result ON copyright_notice_appeal_recommendation_runs(copyright_notice_appeal_recommendation_id) WHERE copyright_notice_appeal_recommendation_id IS NOT NULL;
COMMENT ON TABLE copyright_notice_appeal_recommendation_runs IS 'Per-attempt AI appeal recommendation runs; the immutable recommendation stays success-only evidence and terminal runs expire under bounded operational retention.';
COMMENT ON COLUMN copyright_notice_appeal_recommendation_runs.id IS 'UUIDv7 identity of this admitted run, returned to callers so clients can follow exactly this run.';
COMMENT ON COLUMN copyright_notice_appeal_recommendation_runs.copyright_notice_submission_id IS 'Appeal receipt this run evaluates; at most one run per submission is active.';
COMMENT ON COLUMN copyright_notice_appeal_recommendation_runs.copyright_notice_appeal_recommendation_id IS 'Immutable result written by the transaction that completed this run; null until success.';
COMMENT ON COLUMN copyright_notice_appeal_recommendation_runs.completed_at IS 'Committed with the immutable result; success wins over any delayed failure observation.';
COMMENT ON COLUMN copyright_notice_appeal_recommendation_runs.failed_at IS 'Definitive terminal worker failure, excluding retries and provider deferrals.';
COMMENT ON COLUMN copyright_notice_appeal_recommendation_runs.expired_at IS 'Worker finished without a result because the input no longer applies.';
COMMENT ON COLUMN copyright_notice_appeal_recommendation_runs.status IS 'Outcome derived from the lifecycle timestamps; active until one is set.';
COMMENT ON COLUMN copyright_notice_appeal_recommendation_runs.created_at IS 'Admission time derived from the UUIDv7 identity.';
