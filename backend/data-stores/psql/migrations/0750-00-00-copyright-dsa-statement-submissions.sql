-- Durable, replayable submissions to the DSA Transparency Database. The switch and start date
-- guard producers and consumers; creating these tables does not enable any external submission.

CREATE TYPE copyright_dsa_statement_attempt_outcomes AS ENUM (
  'submitted', 'retryable_failure', 'permanent_failure', 'replayed'
);

CREATE TABLE copyright_dsa_statement_submissions (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  copyright_restriction_id uuid NOT NULL UNIQUE
    REFERENCES copyright_restrictions(id) ON DELETE RESTRICT,
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  available_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lease_token uuid,
  leased_at timestamptz,
  lease_expires_at timestamptz,
  submitted_at timestamptz,
  transparency_database_uuid uuid,
  created_at timestamptz GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK ((lease_token IS NULL AND leased_at IS NULL AND lease_expires_at IS NULL)
    OR (lease_token IS NOT NULL AND leased_at IS NOT NULL AND lease_expires_at IS NOT NULL
      AND lease_expires_at > leased_at)),
  CHECK ((submitted_at IS NULL) = (transparency_database_uuid IS NULL))
);

CREATE INDEX idx_copyright_dsa_statement_submissions__available
  ON copyright_dsa_statement_submissions (available_at, id)
  WHERE submitted_at IS NULL;
CREATE INDEX idx_copyright_dsa_statement_submissions__lease_expiry
  ON copyright_dsa_statement_submissions (lease_expires_at, id)
  WHERE lease_token IS NOT NULL;
CREATE TRIGGER trigger_copyright_dsa_statement_submissions_updated_at
  BEFORE UPDATE ON copyright_dsa_statement_submissions
  FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();

CREATE TABLE copyright_dsa_statement_submission_attempts (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  copyright_dsa_statement_submission_id uuid NOT NULL
    REFERENCES copyright_dsa_statement_submissions(id) ON DELETE CASCADE,
  attempt_number integer NOT NULL CHECK (attempt_number > 0),
  outcome copyright_dsa_statement_attempt_outcomes NOT NULL CHECK (outcome IN (
    'submitted', 'retryable_failure', 'permanent_failure', 'replayed'
  )),
  status_code integer CHECK (status_code IS NULL OR status_code BETWEEN 100 AND 599),
  error_code text CHECK (error_code IS NULL OR char_length(error_code) BETWEEN 1 AND 128),
  replayed_by_id uuid REFERENCES retained_user_identities(id) ON DELETE RESTRICT,
  created_at timestamptz GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  UNIQUE (copyright_dsa_statement_submission_id, attempt_number),
  CHECK ((outcome = 'replayed') = (replayed_by_id IS NOT NULL))
);

CREATE INDEX idx_copyright_dsa_statement_submission_attempts__item__id
  ON copyright_dsa_statement_submission_attempts (copyright_dsa_statement_submission_id, id DESC);
CREATE INDEX idx_copyright_dsa_statement_submission_attempts__replayed_by
  ON copyright_dsa_statement_submission_attempts (replayed_by_id)
  WHERE replayed_by_id IS NOT NULL;
CREATE TRIGGER trigger_copyright_dsa_statement_submission_attempts_immutable
  BEFORE UPDATE OR DELETE ON copyright_dsa_statement_submission_attempts
  FOR EACH ROW EXECUTE FUNCTION fn_reject_mutation();

COMMENT ON TABLE copyright_dsa_statement_submissions IS 'One durable public DSA Transparency Database statement per copyright restriction decision; the payload is frozen before retry.';
COMMENT ON COLUMN copyright_dsa_statement_submissions.id IS 'UUIDv7 durable work-item identifier.';
COMMENT ON COLUMN copyright_dsa_statement_submissions.copyright_restriction_id IS 'The unique Art. 17(1) restriction decision represented by this public statement.';
COMMENT ON COLUMN copyright_dsa_statement_submissions.payload IS 'Validated, personal-data-free API JSON, frozen across retries and replay.';
COMMENT ON COLUMN copyright_dsa_statement_submissions.available_at IS 'Earliest time at which an unsubmitted, non-dead-lettered item may be claimed.';
COMMENT ON COLUMN copyright_dsa_statement_submissions.lease_token IS 'Random claim token fencing every write after the HTTP request.';
COMMENT ON COLUMN copyright_dsa_statement_submissions.leased_at IS 'Time the current worker lease was taken.';
COMMENT ON COLUMN copyright_dsa_statement_submissions.lease_expires_at IS 'Deadline after which a stale lease becomes a retryable failure ledger entry.';
COMMENT ON COLUMN copyright_dsa_statement_submissions.submitted_at IS 'Time the Commission accepted this statement or confirmed its existing PUID.';
COMMENT ON COLUMN copyright_dsa_statement_submissions.transparency_database_uuid IS 'Commission statement UUID returned on success or existing-PUID confirmation.';
COMMENT ON COLUMN copyright_dsa_statement_submissions.created_at IS 'Creation time derived from the UUIDv7 identifier.';
COMMENT ON COLUMN copyright_dsa_statement_submissions.updated_at IS 'Last durable claim or terminal-outcome update.';

COMMENT ON TABLE copyright_dsa_statement_submission_attempts IS 'Append-only outcome ledger; the rows after the latest replay determine retry budget and dead-letter state.';
COMMENT ON COLUMN copyright_dsa_statement_submission_attempts.id IS 'UUIDv7 immutable attempt identifier.';
COMMENT ON COLUMN copyright_dsa_statement_submission_attempts.copyright_dsa_statement_submission_id IS 'Parent durable statement submission.';
COMMENT ON COLUMN copyright_dsa_statement_submission_attempts.attempt_number IS 'Monotone sequence across retries and replay rounds for this submission.';
COMMENT ON COLUMN copyright_dsa_statement_submission_attempts.outcome IS 'Submitted, retryable, permanent, or administrator-replayed outcome.';
COMMENT ON COLUMN copyright_dsa_statement_submission_attempts.status_code IS 'HTTP status when known; no response body is stored.';
COMMENT ON COLUMN copyright_dsa_statement_submission_attempts.error_code IS 'Small failure class or lease_expired marker, never a response body or token.';
COMMENT ON COLUMN copyright_dsa_statement_submission_attempts.replayed_by_id IS 'Retained administrator identity, present only on a replay row and never an authorization source.';
COMMENT ON COLUMN copyright_dsa_statement_submission_attempts.created_at IS 'Attempt time derived from the UUIDv7 identifier.';
