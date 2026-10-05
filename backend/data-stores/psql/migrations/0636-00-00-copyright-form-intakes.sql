-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
-- A form intake is the durable admission record for a structured copyright allegation.
-- It deliberately records the anti-spam recommendation separately: the model is advisory and
-- cannot write a restriction or a human-review decision.

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TABLE copyright_notice_form_intakes (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  copyright_notice_id uuid NOT NULL UNIQUE REFERENCES copyright_notices(id) ON DELETE RESTRICT,
  copyright_notice_submission_id uuid NOT NULL CONSTRAINT uq_copyright_notice_form_intakes__submission_id UNIQUE CONSTRAINT fk_copyright_notice_form_intakes__submission REFERENCES copyright_notice_submissions(id) ON DELETE RESTRICT,
  requester_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  requester_identity_sha256 bytea NOT NULL CHECK (octet_length(requester_identity_sha256) = 32),
  idempotency_key uuid NOT NULL,
  request_sha256 bytea NOT NULL CHECK (octet_length(request_sha256) = 32),
  good_faith_belief boolean NOT NULL,
  accuracy_authority_under_penalty_of_perjury boolean NOT NULL,
  electronic_signature_ciphertext text NOT NULL CONSTRAINT chk_copyri_notice_form_intakes__electronic_signature_ciphertext CHECK (char_length(electronic_signature_ciphertext) BETWEEN 1 AND 1048576),
  created_at timestamptz GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_cop_not_for_inta__requester_identity_sha256__idempotency_key UNIQUE (requester_identity_sha256, idempotency_key)
);

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TABLE copyright_notice_form_screenings (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  copyright_notice_form_intake_id uuid NOT NULL CONSTRAINT fk_copyright_notice_form_screenings__intake REFERENCES copyright_notice_form_intakes(id) ON DELETE RESTRICT,
  input_sha256 bytea NOT NULL CHECK (octet_length(input_sha256) = 32),
  prompt_version text NOT NULL CHECK (char_length(prompt_version) BETWEEN 1 AND 100),
  model text NOT NULL CHECK (char_length(model) BETWEEN 1 AND 255),
  recommendation copyright_notice_form_screening_recommendations NOT NULL CHECK (recommendation IN ('not_obviously_invalid', 'invalid_or_spam')),
  rationale_ciphertext text NOT NULL CHECK (char_length(rationale_ciphertext) BETWEEN 1 AND 1048576),
  guidance_ciphertext text NOT NULL CHECK (char_length(guidance_ciphertext) BETWEEN 1 AND 1048576),
  created_at timestamptz GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_copyright_notice_form_screenings__intake_id__id UNIQUE (copyright_notice_form_intake_id, id)
);

CREATE TYPE copyright_notice_form_screening_attempt_states AS ENUM ('pending', 'failed', 'completed');
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TABLE copyright_notice_form_screening_attempts (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  copyright_notice_form_intake_id uuid NOT NULL CONSTRAINT fk_copyright_notice_form_screening_attempts__intake REFERENCES copyright_notice_form_intakes(id) ON DELETE RESTRICT,
  attempt_number integer NOT NULL CHECK (attempt_number > 0),
  copyright_notice_form_screening_id uuid,
  started_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  lease_token uuid NOT NULL DEFAULT uuidv7(),
  claimed_at timestamptz,
  completed_at timestamptz,
  failed_at timestamptz,
  state copyright_notice_form_screening_attempt_states GENERATED ALWAYS AS (
    CASE WHEN completed_at IS NOT NULL THEN 'completed'::copyright_notice_form_screening_attempt_states
      WHEN failed_at IS NOT NULL THEN 'failed'::copyright_notice_form_screening_attempt_states
      ELSE 'pending'::copyright_notice_form_screening_attempt_states END
  ) STORED,
  created_at timestamptz GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  CONSTRAINT uq_copyri_notice_form_screen_attempt__intake_id__attempt_number UNIQUE (copyright_notice_form_intake_id, attempt_number),
  CONSTRAINT fk_copyright_notice_form_screening_attempts__intake__screening FOREIGN KEY (copyright_notice_form_intake_id, copyright_notice_form_screening_id)
    REFERENCES copyright_notice_form_screenings(copyright_notice_form_intake_id, id) ON DELETE RESTRICT,
  CHECK ((completed_at IS NULL) = (copyright_notice_form_screening_id IS NULL)),
  CHECK (num_nonnulls(completed_at, failed_at) <= 1),
  CHECK (completed_at IS NULL OR completed_at >= started_at),
  CHECK (failed_at IS NULL OR failed_at >= started_at),
  CHECK (claimed_at IS NULL OR claimed_at >= started_at)
);
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX idx_copyright_notice_form_screening_attempts__result ON copyright_notice_form_screening_attempts(copyright_notice_form_screening_id) WHERE copyright_notice_form_screening_id IS NOT NULL;
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX idx_copyright_notice_form_screening_attempts__latest ON copyright_notice_form_screening_attempts(copyright_notice_form_intake_id, attempt_number DESC);

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE FUNCTION fn_reject_copyright_screening_attempt_rewind() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' OR OLD.completed_at IS NOT NULL OR OLD.failed_at IS NOT NULL
    OR (to_jsonb(NEW) - ARRAY['claimed_at', 'completed_at', 'failed_at', 'copyright_notice_form_screening_id', 'state', 'lease_token'])
      IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['claimed_at', 'completed_at', 'failed_at', 'copyright_notice_form_screening_id', 'state', 'lease_token'])
    OR (OLD.claimed_at IS NOT NULL AND NEW.claimed_at IS DISTINCT FROM OLD.claimed_at)
    OR (OLD.lease_token IS DISTINCT FROM NEW.lease_token AND (OLD.claimed_at IS NOT NULL OR NEW.claimed_at IS NULL)) THEN
    RAISE EXCEPTION 'copyright screening attempts cannot be rewritten or restarted' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TRIGGER trigger_copyright_screening_attempts_monotonic BEFORE UPDATE OR DELETE ON copyright_notice_form_screening_attempts
FOR EACH ROW EXECUTE FUNCTION fn_reject_copyright_screening_attempt_rewind();

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TABLE copyright_notice_form_intake_reviews (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  copyright_notice_form_intake_id uuid NOT NULL CONSTRAINT uq_copyright_notice_form_intake_reviews__intake_id UNIQUE CONSTRAINT fk_copyright_notice_form_intake_reviews__intake REFERENCES copyright_notice_form_intakes(id) ON DELETE RESTRICT,
  reviewed_at timestamptz NOT NULL,
  reviewed_by_id uuid REFERENCES users(id) ON DELETE SET NULL,
  accepted boolean NOT NULL,
  rationale_ciphertext text NOT NULL CHECK (char_length(rationale_ciphertext) BETWEEN 1 AND 1048576),
  created_at timestamptz GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX idx_copyright_notice_form_intakes__requester ON copyright_notice_form_intakes(requester_user_id, id DESC) WHERE requester_user_id IS NOT NULL;
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX idx_copyright_notice_form_intake_reviews__reviewer ON copyright_notice_form_intake_reviews(reviewed_by_id) WHERE reviewed_by_id IS NOT NULL;

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TRIGGER trigger_copyright_form_intakes_immutable BEFORE UPDATE OR DELETE ON copyright_notice_form_intakes FOR EACH ROW EXECUTE FUNCTION fn_reject_copyright_immutable_with_actor_erasure('requester_user_id');
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TRIGGER trigger_copyright_form_screenings_immutable BEFORE UPDATE OR DELETE ON copyright_notice_form_screenings FOR EACH ROW EXECUTE FUNCTION fn_reject_copyright_notice_immutable_evidence();
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TRIGGER trigger_copyright_form_reviews_immutable BEFORE UPDATE OR DELETE ON copyright_notice_form_intake_reviews FOR EACH ROW EXECUTE FUNCTION fn_reject_copyright_immutable_with_actor_erasure('reviewed_by_id');
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TRIGGER trigger_copyright_form_reviews_require_actor BEFORE INSERT ON copyright_notice_form_intake_reviews FOR EACH ROW EXECUTE FUNCTION fn_reject_copyright_human_actor('reviewed_by_id');

COMMENT ON TABLE copyright_notice_form_intakes IS 'Idempotent structured web-form copyright admissions. Anonymous identities are one-way digests, not retained IP addresses.';
COMMENT ON TABLE copyright_notice_form_screenings IS 'Immutable advisory anti-spam recommendations with moderator guidance. Only a workflow service, never an agent or its guidance, may decide whether a clear signed-in intake gets a provisional restriction.';
COMMENT ON TABLE copyright_notice_form_intake_reviews IS 'Immutable moderator approval or rejection required before a guest form may affect hosted material.';
COMMENT ON COLUMN copyright_notice_form_intake_reviews.copyright_notice_form_intake_id IS 'Guest form intake reviewed by a moderator.';
COMMENT ON COLUMN copyright_notice_form_intake_reviews.reviewed_at IS 'Time the moderator completed the guest-form decision.';
COMMENT ON COLUMN copyright_notice_form_intake_reviews.reviewed_by_id IS 'Moderator who approved or rejected the guest form; erased on account deletion.';
COMMENT ON COLUMN copyright_notice_form_intake_reviews.accepted IS 'Whether the moderator accepted the guest form as substantially compliant.';
COMMENT ON COLUMN copyright_notice_form_intake_reviews.rationale_ciphertext IS 'Encrypted bounded moderator rationale.';
COMMENT ON COLUMN copyright_notice_form_intakes.copyright_notice_id IS 'Legal case created atomically for the structured form.';
COMMENT ON COLUMN copyright_notice_form_intakes.copyright_notice_submission_id IS 'Initial immutable notice submission created for the form.';
COMMENT ON COLUMN copyright_notice_form_intakes.requester_user_id IS 'Signed-in claimant, or null for a guest form.';
COMMENT ON COLUMN copyright_notice_form_intakes.requester_identity_sha256 IS 'Digest of a user ID or purpose-separated HMAC of a guest IP; the raw guest IP is not retained.';
COMMENT ON COLUMN copyright_notice_form_intakes.idempotency_key IS 'Caller-generated UUID preventing duplicate case admission.';
COMMENT ON COLUMN copyright_notice_form_intakes.request_sha256 IS 'Digest used to reject conflicting reuse of an idempotency key.';
COMMENT ON COLUMN copyright_notice_form_intakes.good_faith_belief IS 'Claimant affirmation of a good-faith belief that the use is unauthorized.';
COMMENT ON COLUMN copyright_notice_form_intakes.accuracy_authority_under_penalty_of_perjury IS 'Claimant affirmation of accuracy and authority under penalty of perjury.';
COMMENT ON COLUMN copyright_notice_form_intakes.electronic_signature_ciphertext IS 'Encrypted claimant electronic signature.';
COMMENT ON COLUMN copyright_notice_form_screenings.copyright_notice_form_intake_id IS 'Structured form intake evaluated for obvious spam or invalidity.';
COMMENT ON COLUMN copyright_notice_form_screenings.input_sha256 IS 'Digest of the exact structured fields screened by the model.';
COMMENT ON COLUMN copyright_notice_form_screenings.prompt_version IS 'Versioned anti-spam screening prompt.';
COMMENT ON COLUMN copyright_notice_form_screenings.model IS 'Model identifier recorded for screening provenance.';
COMMENT ON COLUMN copyright_notice_form_screenings.recommendation IS 'Bounded advisory anti-spam classification.';
COMMENT ON COLUMN copyright_notice_form_screenings.rationale_ciphertext IS 'Encrypted bounded agent rationale.';
COMMENT ON COLUMN copyright_notice_form_screenings.guidance_ciphertext IS 'Encrypted strictly validated moderator guidance: summary, section 512(c)(3) element checklist, risk notes, and advisory suggested action. Staff-visible only; no workflow predicate reads it.';


COMMENT ON TABLE copyright_notice_form_screening_attempts IS 'One monotonic row per screening attempt; current authority comes only from the latest attempt for an intake.';
COMMENT ON COLUMN copyright_notice_form_screening_attempts.copyright_notice_form_intake_id IS 'Concrete intake whose screening attempts share the form-review fence.';
COMMENT ON COLUMN copyright_notice_form_screening_attempts.attempt_number IS 'Monotonic intake-local attempt number; retries append rather than reset earlier attempts.';
COMMENT ON COLUMN copyright_notice_form_screening_attempts.copyright_notice_form_screening_id IS 'Immutable result selected on successful completion of this attempt.';
COMMENT ON COLUMN copyright_notice_form_screening_attempts.lease_token IS 'Opaque equality-only worker ownership token for this attempt.';
COMMENT ON COLUMN copyright_notice_form_screening_attempts.started_at IS 'Time the attempt removed automatic authority.';
COMMENT ON COLUMN copyright_notice_form_screening_attempts.claimed_at IS 'First provider claim; an expired claim is failed and replaced by a new attempt.';
COMMENT ON COLUMN copyright_notice_form_screening_attempts.completed_at IS 'Successful terminal completion time.';
COMMENT ON COLUMN copyright_notice_form_screening_attempts.failed_at IS 'Failed or superseded terminal completion time.';
COMMENT ON COLUMN copyright_notice_form_screening_attempts.state IS 'Current attempt state derived from its terminal facts.';
