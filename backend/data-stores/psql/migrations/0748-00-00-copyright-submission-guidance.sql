CREATE TABLE copyright_notice_submission_guidance (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  copyright_notice_submission_id uuid NOT NULL CONSTRAINT fk_copyright_notice_submission_guidance__submission REFERENCES copyright_notice_submissions(id) ON DELETE RESTRICT,
  input_sha256 bytea NOT NULL CHECK (octet_length(input_sha256) = 32),
  prompt_version text NOT NULL CHECK (char_length(prompt_version) BETWEEN 1 AND 100),
  model text NOT NULL CHECK (char_length(model) BETWEEN 1 AND 255),
  guidance_ciphertext text NOT NULL CHECK (char_length(guidance_ciphertext) BETWEEN 1 AND 1048576),
  created_at timestamptz GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,

  CONSTRAINT uq_cop_not_sub_gui__submission_id__input_sha256__prompt_version UNIQUE (copyright_notice_submission_id, input_sha256, prompt_version)
);
CREATE INDEX idx_copyright_notice_submission_guidance__submission
  ON copyright_notice_submission_guidance (copyright_notice_submission_id, id DESC);
CREATE TRIGGER trigger_copyright_submission_guidance_immutable BEFORE UPDATE OR DELETE ON copyright_notice_submission_guidance FOR EACH ROW EXECUTE FUNCTION fn_reject_copyright_notice_immutable_evidence();

COMMENT ON TABLE copyright_notice_submission_guidance IS 'Immutable advisory AI guidance for a filed counter-notice or court/CCB filing; never an authorization to decide or alter material availability.';
COMMENT ON COLUMN copyright_notice_submission_guidance.copyright_notice_submission_id IS 'The immutable counter-notice or court/CCB receipt evaluated by the agent.';
COMMENT ON COLUMN copyright_notice_submission_guidance.input_sha256 IS 'Digest of the redacted, sanitized model-visible submission and notice context.';
COMMENT ON COLUMN copyright_notice_submission_guidance.prompt_version IS 'Versioned advisory submission-guidance prompt.';
COMMENT ON COLUMN copyright_notice_submission_guidance.model IS 'Model identifier recorded for guidance provenance.';
COMMENT ON COLUMN copyright_notice_submission_guidance.guidance_ciphertext IS 'Encrypted, bounded advisory output visible only to authorized staff.';

CREATE TABLE copyright_notice_submission_guidance_runs (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  copyright_notice_submission_id uuid NOT NULL CONSTRAINT fk_copyright_notice_submission_guidance_runs__submission REFERENCES copyright_notice_submissions(id) ON DELETE RESTRICT,
  copyright_notice_submission_guidance_id uuid CONSTRAINT fk_copyright_notice_submission_guidance_runs__result REFERENCES copyright_notice_submission_guidance(id) ON DELETE RESTRICT,
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
  CHECK ((completed_at IS NULL) = (copyright_notice_submission_guidance_id IS NULL)),
  CHECK (num_nonnulls(completed_at, failed_at, expired_at) <= 1)
);
CREATE UNIQUE INDEX uq_copyright_notice_submission_guidance_runs__active ON copyright_notice_submission_guidance_runs(copyright_notice_submission_id)
  WHERE completed_at IS NULL AND failed_at IS NULL AND expired_at IS NULL;
CREATE INDEX idx_copyright_notice_submission_guidance_runs__submission ON copyright_notice_submission_guidance_runs(copyright_notice_submission_id, id DESC);
CREATE INDEX idx_copyright_notice_submission_guidance_runs__result ON copyright_notice_submission_guidance_runs(copyright_notice_submission_guidance_id) WHERE copyright_notice_submission_guidance_id IS NOT NULL;
COMMENT ON TABLE copyright_notice_submission_guidance_runs IS 'Per-attempt AI submission guidance runs; the immutable guidance stays success-only evidence and terminal runs expire under bounded operational retention.';
COMMENT ON COLUMN copyright_notice_submission_guidance_runs.id IS 'UUIDv7 identity of this admitted run, returned to callers so clients can follow exactly this run.';
COMMENT ON COLUMN copyright_notice_submission_guidance_runs.copyright_notice_submission_id IS 'Counter-notice or court/CCB receipt this run evaluates; at most one run per submission is active.';
COMMENT ON COLUMN copyright_notice_submission_guidance_runs.copyright_notice_submission_guidance_id IS 'Immutable result written by the transaction that completed this run; null until success.';
COMMENT ON COLUMN copyright_notice_submission_guidance_runs.completed_at IS 'Committed with the immutable result; success wins over any delayed failure observation.';
COMMENT ON COLUMN copyright_notice_submission_guidance_runs.failed_at IS 'Definitive terminal worker failure, excluding retries and provider deferrals.';
COMMENT ON COLUMN copyright_notice_submission_guidance_runs.expired_at IS 'Worker finished without a result because the input no longer applies.';
COMMENT ON COLUMN copyright_notice_submission_guidance_runs.status IS 'Outcome derived from the lifecycle timestamps; active until one is set.';
COMMENT ON COLUMN copyright_notice_submission_guidance_runs.created_at IS 'Admission time derived from the UUIDv7 identity.';
