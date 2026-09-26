CREATE TABLE copyright_notice_appeal_recommendations (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  copyright_notice_submission_id uuid NOT NULL REFERENCES copyright_notice_submissions(id) ON DELETE RESTRICT,
  input_sha256 bytea NOT NULL CHECK (octet_length(input_sha256) = 32),
  prompt_version text NOT NULL CHECK (char_length(prompt_version) BETWEEN 1 AND 100),
  model text NOT NULL CHECK (char_length(model) BETWEEN 1 AND 255),
  recommendation text NOT NULL CHECK (recommendation IN ('confirm', 'modify', 'reverse', 'uncertain')),
  rationale_ciphertext text NOT NULL CHECK (char_length(rationale_ciphertext) BETWEEN 1 AND 1048576),
  created_at timestamptz GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (copyright_notice_submission_id, input_sha256, prompt_version)
);
CREATE INDEX idx_copyright_appeal_recommendations__submission
  ON copyright_notice_appeal_recommendations (copyright_notice_submission_id, id DESC);
CREATE TRIGGER trigger_copyright_appeal_recommendations_immutable BEFORE UPDATE OR DELETE ON copyright_notice_appeal_recommendations FOR EACH ROW EXECUTE FUNCTION fn_guard_copyright_notice_immutable_evidence();

COMMENT ON TABLE copyright_notice_appeal_recommendations IS 'Immutable advisory recommendations for a moderator evaluating an ordinary copyright appeal; never an authorization to alter material availability.';
COMMENT ON COLUMN copyright_notice_appeal_recommendations.copyright_notice_submission_id IS 'The immutable ordinary appeal receipt evaluated by the agent.';
COMMENT ON COLUMN copyright_notice_appeal_recommendations.input_sha256 IS 'Digest of the structured appeal and notice context supplied to the model.';
COMMENT ON COLUMN copyright_notice_appeal_recommendations.prompt_version IS 'Versioned advisory recommendation prompt.';
COMMENT ON COLUMN copyright_notice_appeal_recommendations.model IS 'Model identifier recorded for recommendation provenance.';
COMMENT ON COLUMN copyright_notice_appeal_recommendations.recommendation IS 'Bounded advisory disposition for a moderator; no worker acts on it.';
COMMENT ON COLUMN copyright_notice_appeal_recommendations.rationale_ciphertext IS 'Encrypted bounded agent rationale visible only to authorized staff.';
