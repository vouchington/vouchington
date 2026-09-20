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
  recommendation text NOT NULL CHECK (recommendation IN ('clear', 'invalid_or_spam', 'uncertain')),
  rationale_ciphertext text NOT NULL CHECK (char_length(rationale_ciphertext) BETWEEN 1 AND 1048576),
  created_at timestamptz GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (copyright_notice_form_intake_id, input_sha256, prompt_version)
);

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

CREATE INDEX idx_copyright_form_screenings__intake ON copyright_notice_form_screenings(copyright_notice_form_intake_id, id DESC);
CREATE INDEX idx_copyright_form_intakes__requester ON copyright_notice_form_intakes(requester_user_id, id DESC) WHERE requester_user_id IS NOT NULL;
CREATE INDEX idx_copyright_form_reviews__reviewer ON copyright_notice_form_intake_reviews(reviewed_by_id) WHERE reviewed_by_id IS NOT NULL;

CREATE TRIGGER trigger_copyright_form_intakes_immutable BEFORE UPDATE OR DELETE ON copyright_notice_form_intakes FOR EACH ROW EXECUTE FUNCTION fn_guard_copyright_immutable_with_actor_erasure('requester_user_id');
CREATE TRIGGER trigger_copyright_form_screenings_immutable BEFORE UPDATE OR DELETE ON copyright_notice_form_screenings FOR EACH ROW EXECUTE FUNCTION fn_guard_copyright_notice_immutable_evidence();
CREATE TRIGGER trigger_copyright_form_reviews_immutable BEFORE UPDATE OR DELETE ON copyright_notice_form_intake_reviews FOR EACH ROW EXECUTE FUNCTION fn_guard_copyright_immutable_with_actor_erasure('reviewed_by_id');
CREATE TRIGGER trigger_copyright_form_reviews_require_actor BEFORE INSERT ON copyright_notice_form_intake_reviews FOR EACH ROW EXECUTE FUNCTION fn_require_copyright_human_actor('reviewed_by_id');

COMMENT ON TABLE copyright_notice_form_intakes IS 'Idempotent structured web-form copyright admissions. Anonymous identities are one-way digests, not retained IP addresses.';
COMMENT ON TABLE copyright_notice_form_screenings IS 'Immutable advisory anti-spam recommendations. Only a workflow service, never an agent, may decide whether a clear signed-in intake gets a provisional restriction.';
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
