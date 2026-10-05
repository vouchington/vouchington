-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
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
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX idx_copyright_notice_submission_guidance__submission
  ON copyright_notice_submission_guidance (copyright_notice_submission_id, id DESC);
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TRIGGER trigger_copyright_submission_guidance_immutable BEFORE UPDATE OR DELETE ON copyright_notice_submission_guidance FOR EACH ROW EXECUTE FUNCTION fn_reject_copyright_notice_immutable_evidence();

COMMENT ON TABLE copyright_notice_submission_guidance IS 'Immutable advisory AI guidance for a filed counter-notice or court/CCB filing; never an authorization to decide or alter material availability.';
COMMENT ON COLUMN copyright_notice_submission_guidance.copyright_notice_submission_id IS 'The immutable counter-notice or court/CCB receipt evaluated by the agent.';
COMMENT ON COLUMN copyright_notice_submission_guidance.input_sha256 IS 'Digest of the redacted, sanitized model-visible submission and notice context.';
COMMENT ON COLUMN copyright_notice_submission_guidance.prompt_version IS 'Versioned advisory submission-guidance prompt.';
COMMENT ON COLUMN copyright_notice_submission_guidance.model IS 'Model identifier recorded for guidance provenance.';
COMMENT ON COLUMN copyright_notice_submission_guidance.guidance_ciphertext IS 'Encrypted, bounded advisory output visible only to authorized staff.';
