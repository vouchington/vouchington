-- A form intake is the durable admission record for a structured copyright allegation.
-- It deliberately records the anti-spam recommendation separately: the model is advisory and
-- cannot write a restriction or a human-review decision.

CREATE TABLE copyright_notice_form_intakes (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  copyright_notice_id uuid NOT NULL UNIQUE REFERENCES copyright_notices(id) ON DELETE RESTRICT,
  copyright_notice_submission_id uuid NOT NULL UNIQUE REFERENCES copyright_notice_submissions(id) ON DELETE RESTRICT,
  requester_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  requester_identity_sha256 bytea NOT NULL CHECK (octet_length(requester_identity_sha256) = 32),
  idempotency_key uuid NOT NULL,
  request_sha256 bytea NOT NULL CHECK (octet_length(request_sha256) = 32),
  good_faith_belief boolean NOT NULL,
  accuracy_authority_under_penalty_of_perjury boolean NOT NULL,
  electronic_signature_ciphertext text NOT NULL CHECK (char_length(electronic_signature_ciphertext) BETWEEN 1 AND 1048576),
  created_at timestamptz GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (requester_identity_sha256, idempotency_key)
);

CREATE TABLE copyright_notice_form_screenings (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  copyright_notice_form_intake_id uuid NOT NULL REFERENCES copyright_notice_form_intakes(id) ON DELETE RESTRICT,
  input_sha256 bytea NOT NULL CHECK (octet_length(input_sha256) = 32),
  prompt_version text NOT NULL CHECK (char_length(prompt_version) BETWEEN 1 AND 100),
  model text NOT NULL CHECK (char_length(model) BETWEEN 1 AND 255),
  recommendation text NOT NULL CHECK (recommendation IN ('not_obviously_invalid', 'invalid_or_spam')),
  rationale_ciphertext text NOT NULL CHECK (char_length(rationale_ciphertext) BETWEEN 1 AND 1048576),
  guidance_ciphertext text NOT NULL CHECK (char_length(guidance_ciphertext) BETWEEN 1 AND 1048576),
  created_at timestamptz GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (copyright_notice_form_intake_id, id)
);

CREATE TABLE copyright_notice_form_screening_executions (
  copyright_notice_form_intake_id uuid PRIMARY KEY REFERENCES copyright_notice_form_intakes(id) ON DELETE RESTRICT,
  attempt_number integer NOT NULL CHECK (attempt_number > 0),
  state text NOT NULL CHECK (state IN ('pending', 'failed', 'completed')),
  copyright_notice_form_screening_id uuid,
  started_at timestamptz NOT NULL,
  claimed_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (copyright_notice_form_intake_id, copyright_notice_form_screening_id)
    REFERENCES copyright_notice_form_screenings(copyright_notice_form_intake_id, id) ON DELETE RESTRICT,
  CHECK ((state = 'pending' AND copyright_notice_form_screening_id IS NULL AND completed_at IS NULL)
    OR (state = 'failed' AND copyright_notice_form_screening_id IS NULL AND claimed_at IS NULL AND completed_at IS NOT NULL)
    OR (state = 'completed' AND copyright_notice_form_screening_id IS NOT NULL AND claimed_at IS NULL AND completed_at IS NOT NULL)),
  CHECK (completed_at IS NULL OR completed_at >= started_at),
  CHECK (claimed_at IS NULL OR claimed_at >= started_at)
);

CREATE INDEX idx_copyright_screening_executions__result ON copyright_notice_form_screening_executions(copyright_notice_form_screening_id) WHERE copyright_notice_form_screening_id IS NOT NULL;

CREATE TABLE copyright_notice_form_intake_reviews (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  copyright_notice_form_intake_id uuid NOT NULL UNIQUE REFERENCES copyright_notice_form_intakes(id) ON DELETE RESTRICT,
  reviewed_at timestamptz NOT NULL,
  reviewed_by_id uuid REFERENCES users(id) ON DELETE SET NULL,
  accepted boolean NOT NULL,
  rationale_ciphertext text NOT NULL CHECK (char_length(rationale_ciphertext) BETWEEN 1 AND 1048576),
  created_at timestamptz GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_copyright_form_intakes__requester ON copyright_notice_form_intakes(requester_user_id, id DESC) WHERE requester_user_id IS NOT NULL;
CREATE INDEX idx_copyright_form_reviews__reviewer ON copyright_notice_form_intake_reviews(reviewed_by_id) WHERE reviewed_by_id IS NOT NULL;

CREATE TRIGGER trigger_copyright_form_intakes_immutable BEFORE UPDATE OR DELETE ON copyright_notice_form_intakes FOR EACH ROW EXECUTE FUNCTION fn_guard_copyright_immutable_with_actor_erasure('requester_user_id');
CREATE TRIGGER trigger_copyright_form_screenings_immutable BEFORE UPDATE OR DELETE ON copyright_notice_form_screenings FOR EACH ROW EXECUTE FUNCTION fn_guard_copyright_notice_immutable_evidence();
CREATE TRIGGER trigger_copyright_form_reviews_immutable BEFORE UPDATE OR DELETE ON copyright_notice_form_intake_reviews FOR EACH ROW EXECUTE FUNCTION fn_guard_copyright_immutable_with_actor_erasure('reviewed_by_id');
CREATE TRIGGER trigger_copyright_form_reviews_require_actor BEFORE INSERT ON copyright_notice_form_intake_reviews FOR EACH ROW EXECUTE FUNCTION fn_require_copyright_human_actor('reviewed_by_id');

COMMENT ON TABLE copyright_notice_form_intakes IS 'Idempotent structured web-form copyright admissions. Anonymous identities are one-way digests, not retained IP addresses.';
COMMENT ON TABLE copyright_notice_form_screenings IS 'Immutable advisory anti-spam recommendations with moderator guidance. Only a workflow service, never an agent or its guidance, may decide whether a clear signed-in intake gets a provisional restriction.';
COMMENT ON TABLE copyright_notice_form_screening_executions IS 'One current anti-spam execution per structured intake. Its attempt token fences stale completions and its selected immutable result defines current automatic authority.';
COMMENT ON COLUMN copyright_notice_form_screening_executions.copyright_notice_form_intake_id IS 'Concrete intake whose current screening execution is owned by the form-review fence.';
COMMENT ON COLUMN copyright_notice_form_screening_executions.attempt_number IS 'Monotonic token advanced on a new screen or failed/expired claim retry.';
COMMENT ON COLUMN copyright_notice_form_screening_executions.state IS 'Current pending, failed, or completed screening execution.';
COMMENT ON COLUMN copyright_notice_form_screening_executions.copyright_notice_form_screening_id IS 'Successful immutable result selected only by completion of the current attempt in the same intake.';
COMMENT ON COLUMN copyright_notice_form_screening_executions.started_at IS 'Time the current attempt first removed automatic authority.';
COMMENT ON COLUMN copyright_notice_form_screening_executions.claimed_at IS 'Current provider execution lease; expired leases rotate the attempt token.';
COMMENT ON COLUMN copyright_notice_form_screening_executions.completed_at IS 'Terminal success or failure time for the current attempt.';
COMMENT ON COLUMN copyright_notice_form_screening_executions.updated_at IS 'Time the current execution row last changed.';
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
