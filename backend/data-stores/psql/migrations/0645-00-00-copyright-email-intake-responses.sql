-- A declined email intake is not a copyright case and must never acquire a public case record.
-- Its response still has to be a durable, private legal communication with bounded delivery.

CREATE TABLE copyright_notice_email_intake_responses (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  copyright_notice_email_intake_id uuid NOT NULL REFERENCES copyright_notice_email_intakes(id) ON DELETE RESTRICT,
  response_kind text NOT NULL CHECK (response_kind IN ('rejected', 'needs_information')),
  recipient_email_ciphertext text NOT NULL CHECK (char_length(recipient_email_ciphertext) BETWEEN 1 AND 1048576),
  subject_ciphertext text NOT NULL CHECK (char_length(subject_ciphertext) BETWEEN 1 AND 1048576),
  body_ciphertext text NOT NULL CHECK (char_length(body_ciphertext) BETWEEN 1 AND 1048576),
  idempotency_key text NOT NULL UNIQUE CHECK (char_length(idempotency_key) BETWEEN 1 AND 512),
  state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending', 'claimed', 'sent', 'failed', 'bounced')),
  delivery_attempt_count integer NOT NULL DEFAULT 0 CHECK (delivery_attempt_count BETWEEN 0 AND 5),
  claimed_at timestamptz,
  delivery_attempted_at timestamptz,
  sent_at timestamptz,
  failed_at timestamptz,
  next_attempt_at timestamptz,
  bounced_at timestamptz,
  ses_message_id text CHECK (ses_message_id IS NULL OR char_length(ses_message_id) BETWEEN 1 AND 1024),
  failure_ciphertext text CHECK (failure_ciphertext IS NULL OR char_length(failure_ciphertext) BETWEEN 1 AND 1048576),
  created_at timestamptz GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (copyright_notice_email_intake_id),
  CHECK ((state = 'pending' AND claimed_at IS NULL AND sent_at IS NULL AND failed_at IS NULL AND bounced_at IS NULL)
    OR (state = 'claimed' AND claimed_at IS NOT NULL AND delivery_attempted_at IS NOT NULL AND sent_at IS NULL AND failed_at IS NULL AND bounced_at IS NULL)
    OR (state = 'sent' AND delivery_attempted_at IS NOT NULL AND sent_at IS NOT NULL AND failed_at IS NULL AND bounced_at IS NULL)
    OR (state = 'failed' AND delivery_attempted_at IS NOT NULL AND failed_at IS NOT NULL AND sent_at IS NULL AND bounced_at IS NULL)
    OR (state = 'bounced' AND delivery_attempted_at IS NOT NULL AND sent_at IS NOT NULL AND bounced_at IS NOT NULL AND failed_at IS NULL)),
  CHECK (failure_ciphertext IS NULL OR state IN ('pending', 'failed')),
  CHECK ((state = 'pending' AND (delivery_attempt_count = 0 OR next_attempt_at IS NOT NULL))
    OR (state <> 'pending' AND next_attempt_at IS NULL)),
  CHECK (ses_message_id IS NULL OR state IN ('sent', 'bounced'))
);

CREATE INDEX idx_copyright_email_intake_responses__pending
  ON copyright_notice_email_intake_responses (next_attempt_at, id) WHERE state = 'pending';
CREATE INDEX idx_copyright_email_intake_responses__ses_message
  ON copyright_notice_email_intake_responses (ses_message_id) WHERE ses_message_id IS NOT NULL;

CREATE OR REPLACE FUNCTION fn_guard_copyright_email_intake_response_transition()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'copyright email intake responses are retained' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.copyright_notice_email_intake_id IS DISTINCT FROM OLD.copyright_notice_email_intake_id
    OR NEW.response_kind IS DISTINCT FROM OLD.response_kind
    OR NEW.recipient_email_ciphertext IS DISTINCT FROM OLD.recipient_email_ciphertext
    OR NEW.subject_ciphertext IS DISTINCT FROM OLD.subject_ciphertext
    OR NEW.body_ciphertext IS DISTINCT FROM OLD.body_ciphertext
    OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key THEN
    RAISE EXCEPTION 'copyright email intake response facts are immutable' USING ERRCODE = 'check_violation';
  END IF;
  IF (OLD.state IN ('bounced', 'failed') AND NEW.state IS DISTINCT FROM OLD.state)
    OR (OLD.state = 'sent' AND NEW.state NOT IN ('sent', 'bounced')) THEN
    RAISE EXCEPTION 'terminal copyright email intake response cannot change' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trigger_copyright_email_intake_response_transition
BEFORE UPDATE OR DELETE ON copyright_notice_email_intake_responses
FOR EACH ROW EXECUTE FUNCTION fn_guard_copyright_email_intake_response_transition();
CREATE TRIGGER trigger_copyright_email_intake_responses_updated_at
BEFORE UPDATE ON copyright_notice_email_intake_responses
FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();

COMMENT ON TABLE copyright_notice_email_intake_responses IS 'Private, durable responses to rejected or incomplete email intakes. These rows never create a copyright case.';
COMMENT ON COLUMN copyright_notice_email_intake_responses.copyright_notice_email_intake_id IS 'The private inbound email receiving this response.';
COMMENT ON COLUMN copyright_notice_email_intake_responses.response_kind IS 'Whether the intake was rejected or requires more information.';
COMMENT ON COLUMN copyright_notice_email_intake_responses.recipient_email_ciphertext IS 'Intake sender address encrypted specifically for this response.';
COMMENT ON COLUMN copyright_notice_email_intake_responses.subject_ciphertext IS 'Immutable encrypted response subject.';
COMMENT ON COLUMN copyright_notice_email_intake_responses.body_ciphertext IS 'Immutable encrypted response body.';
COMMENT ON COLUMN copyright_notice_email_intake_responses.idempotency_key IS 'Stable key preventing duplicate responses to one intake.';
COMMENT ON COLUMN copyright_notice_email_intake_responses.state IS 'Bounded durable email delivery lifecycle.';
COMMENT ON COLUMN copyright_notice_email_intake_responses.delivery_attempt_count IS 'Number of claimed send attempts, capped at five.';
COMMENT ON COLUMN copyright_notice_email_intake_responses.claimed_at IS 'Time a worker claimed this response.';
COMMENT ON COLUMN copyright_notice_email_intake_responses.delivery_attempted_at IS 'Time the latest send attempt began.';
COMMENT ON COLUMN copyright_notice_email_intake_responses.sent_at IS 'Time SES accepted this response.';
COMMENT ON COLUMN copyright_notice_email_intake_responses.failed_at IS 'Time delivery became terminally failed.';
COMMENT ON COLUMN copyright_notice_email_intake_responses.next_attempt_at IS 'Earliest retry time after a retryable failure.';
COMMENT ON COLUMN copyright_notice_email_intake_responses.bounced_at IS 'Time SES reported this response undeliverable.';
COMMENT ON COLUMN copyright_notice_email_intake_responses.ses_message_id IS 'SES provider identifier for this response.';
COMMENT ON COLUMN copyright_notice_email_intake_responses.failure_ciphertext IS 'Encrypted bounded latest transport failure.';
