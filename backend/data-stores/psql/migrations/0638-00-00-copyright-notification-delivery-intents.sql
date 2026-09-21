-- Copyright communications are legal records. Delivery is a separate, retryable concern so a
-- transport outage cannot erase the obligation to notify either party.

ALTER TABLE copyright_notice_submissions
  -- squawk-ignore disallowed-unique-constraint, constraint-missing-not-valid -- Copyright intake is activation-gated and this stack has not accepted production submissions.
  ADD CONSTRAINT copyright_notice_submissions_id_notice_unique
  UNIQUE (id, copyright_notice_id);
ALTER TABLE copyright_notice_correspondence_messages
  -- squawk-ignore disallowed-unique-constraint, constraint-missing-not-valid -- Copyright intake is activation-gated and this stack has not created production correspondence.
  ADD CONSTRAINT copyright_notice_correspondence_id_notice_unique
  UNIQUE (id, copyright_notice_id);

CREATE TABLE copyright_notice_delivery_intents (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  copyright_notice_id uuid NOT NULL REFERENCES copyright_notices(id) ON DELETE RESTRICT,
  copyright_notice_submission_id uuid,
  copyright_notice_correspondence_message_id uuid,
  recipient_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  recipient_user_erased_at timestamptz,
  recipient_role text NOT NULL CHECK (recipient_role IN ('claimant', 'poster', 'correspondent')),
  delivery_kind text NOT NULL CHECK (delivery_kind IN ('claimant_receipt', 'status_update', 'poster_restriction_notice', 'counter_notice_forwarding')),
  channel text NOT NULL CHECK (channel IN ('in_app', 'email')),
  state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending', 'claimed', 'sent', 'failed', 'bounced')),
  delivery_attempt_count integer NOT NULL DEFAULT 0 CHECK (delivery_attempt_count BETWEEN 0 AND 5),
  idempotency_key text NOT NULL CHECK (char_length(idempotency_key) BETWEEN 1 AND 512),
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
  UNIQUE (idempotency_key),
  FOREIGN KEY (copyright_notice_submission_id, copyright_notice_id)
    REFERENCES copyright_notice_submissions(id, copyright_notice_id) ON DELETE RESTRICT,
  FOREIGN KEY (copyright_notice_correspondence_message_id, copyright_notice_id)
    REFERENCES copyright_notice_correspondence_messages(id, copyright_notice_id) ON DELETE RESTRICT,
  CHECK (recipient_role <> 'poster' OR recipient_user_id IS NOT NULL OR recipient_user_erased_at IS NOT NULL),
  CHECK (recipient_role <> 'correspondent' OR recipient_user_id IS NULL),
  CHECK (recipient_user_erased_at IS NULL OR recipient_user_id IS NULL),
  CHECK ((state = 'pending' AND claimed_at IS NULL AND sent_at IS NULL AND failed_at IS NULL AND bounced_at IS NULL)
    OR (state = 'claimed' AND claimed_at IS NOT NULL AND delivery_attempted_at IS NOT NULL AND sent_at IS NULL AND failed_at IS NULL AND bounced_at IS NULL)
    OR (state = 'sent' AND delivery_attempted_at IS NOT NULL AND sent_at IS NOT NULL AND failed_at IS NULL AND bounced_at IS NULL)
    OR (state = 'failed' AND delivery_attempted_at IS NOT NULL AND failed_at IS NOT NULL AND sent_at IS NULL AND bounced_at IS NULL)
    OR (state = 'bounced' AND delivery_attempted_at IS NOT NULL AND sent_at IS NOT NULL AND bounced_at IS NOT NULL AND failed_at IS NULL)),
  CHECK (failure_ciphertext IS NULL OR state IN ('pending', 'failed')),
  CHECK ((state = 'pending' AND (delivery_attempt_count = 0 OR next_attempt_at IS NOT NULL))
    OR (state <> 'pending' AND next_attempt_at IS NULL)),
  CHECK (ses_message_id IS NULL OR channel = 'email')
);

CREATE INDEX idx_copyright_delivery_intents__pending
  ON copyright_notice_delivery_intents (next_attempt_at, id) WHERE state = 'pending';
CREATE INDEX idx_copyright_delivery_intents__notice
  ON copyright_notice_delivery_intents (copyright_notice_id, id);
CREATE INDEX idx_copyright_delivery_intents__submission
  ON copyright_notice_delivery_intents (copyright_notice_submission_id, copyright_notice_id)
  WHERE copyright_notice_submission_id IS NOT NULL;
CREATE INDEX idx_copyright_delivery_intents__correspondence
  ON copyright_notice_delivery_intents (copyright_notice_correspondence_message_id, copyright_notice_id)
  WHERE copyright_notice_correspondence_message_id IS NOT NULL;
CREATE INDEX idx_copyright_delivery_intents__recipient_user
  ON copyright_notice_delivery_intents (recipient_user_id)
  WHERE recipient_user_id IS NOT NULL;
CREATE INDEX idx_copyright_delivery_intents__ses_message
  ON copyright_notice_delivery_intents (ses_message_id) WHERE ses_message_id IS NOT NULL;

CREATE OR REPLACE FUNCTION fn_guard_copyright_delivery_intent_transition()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'copyright delivery intents are retained' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.copyright_notice_id IS DISTINCT FROM OLD.copyright_notice_id
    OR NEW.copyright_notice_submission_id IS DISTINCT FROM OLD.copyright_notice_submission_id
    OR NEW.copyright_notice_correspondence_message_id IS DISTINCT FROM OLD.copyright_notice_correspondence_message_id
    OR NEW.recipient_role IS DISTINCT FROM OLD.recipient_role
    OR NEW.delivery_kind IS DISTINCT FROM OLD.delivery_kind
    OR NEW.channel IS DISTINCT FROM OLD.channel
    OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key THEN
    RAISE EXCEPTION 'copyright delivery intent facts are immutable' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.recipient_user_id IS DISTINCT FROM NEW.recipient_user_id THEN
    IF OLD.recipient_user_id IS NULL OR NEW.recipient_user_id IS NOT NULL THEN
      RAISE EXCEPTION 'copyright delivery recipient cannot change' USING ERRCODE = 'check_violation';
    END IF;
    NEW.recipient_user_erased_at := CURRENT_TIMESTAMP;
  ELSIF NEW.recipient_user_erased_at IS DISTINCT FROM OLD.recipient_user_erased_at THEN
    RAISE EXCEPTION 'copyright delivery recipient erasure is system-managed' USING ERRCODE = 'check_violation';
  END IF;
  IF (OLD.state IN ('bounced', 'failed') AND NEW.state IS DISTINCT FROM OLD.state)
    OR (OLD.state = 'sent' AND NEW.state NOT IN ('sent', 'bounced')) THEN
    RAISE EXCEPTION 'terminal copyright delivery intent cannot change' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trigger_copyright_delivery_intent_transition
BEFORE UPDATE OR DELETE ON copyright_notice_delivery_intents
FOR EACH ROW EXECUTE FUNCTION fn_guard_copyright_delivery_intent_transition();
CREATE TRIGGER trigger_copyright_delivery_intents_updated_at
BEFORE UPDATE ON copyright_notice_delivery_intents
FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();

COMMENT ON TABLE copyright_notice_delivery_intents IS 'Durable, idempotent legal-notice delivery obligations. Transport workers claim and transition intents; they cannot alter case facts.';
COMMENT ON COLUMN copyright_notice_delivery_intents.copyright_notice_id IS 'Copyright case that owns the delivery obligation.';
COMMENT ON COLUMN copyright_notice_delivery_intents.copyright_notice_submission_id IS 'Optional immutable submission that caused the delivery.';
COMMENT ON COLUMN copyright_notice_delivery_intents.copyright_notice_correspondence_message_id IS 'Optional private correspondence body delivered by this obligation.';
COMMENT ON COLUMN copyright_notice_delivery_intents.recipient_user_id IS 'Voucha user receiving the notice when the recipient has an account.';
COMMENT ON COLUMN copyright_notice_delivery_intents.recipient_user_erased_at IS 'Time account erasure removed a poster recipient reference while retaining the legal delivery record.';
COMMENT ON COLUMN copyright_notice_delivery_intents.recipient_role IS 'Legal role of the recipient: claimant, affected poster, or external email correspondent.';
COMMENT ON COLUMN copyright_notice_delivery_intents.delivery_kind IS 'Legal event communicated by this delivery.';
COMMENT ON COLUMN copyright_notice_delivery_intents.channel IS 'Transport channel used for the delivery.';
COMMENT ON COLUMN copyright_notice_delivery_intents.state IS 'Durable transport lifecycle state.';
COMMENT ON COLUMN copyright_notice_delivery_intents.delivery_attempt_count IS 'Number of claimed transport attempts, capped to prevent an unhealthy obligation starving other delivery work.';
COMMENT ON COLUMN copyright_notice_delivery_intents.idempotency_key IS 'Stable domain key preventing duplicate delivery obligations.';
COMMENT ON COLUMN copyright_notice_delivery_intents.claimed_at IS 'Time a transport worker most recently claimed the obligation.';
COMMENT ON COLUMN copyright_notice_delivery_intents.delivery_attempted_at IS 'Time the terminal transport attempt began.';
COMMENT ON COLUMN copyright_notice_delivery_intents.sent_at IS 'Time the provider accepted the delivery.';
COMMENT ON COLUMN copyright_notice_delivery_intents.failed_at IS 'Time the most recent retryable transport attempt failed.';
COMMENT ON COLUMN copyright_notice_delivery_intents.next_attempt_at IS 'Earliest retry time after a retryable transport failure; NULL for terminal states.';
COMMENT ON COLUMN copyright_notice_delivery_intents.bounced_at IS 'Time SES reported a bounce or complaint for an accepted email.';
COMMENT ON COLUMN copyright_notice_delivery_intents.ses_message_id IS 'SES provider identifier used to correlate delivery feedback.';
COMMENT ON COLUMN copyright_notice_delivery_intents.failure_ciphertext IS 'Encrypted bounded transport failure visible to staff; retries retain the failure history through lifecycle events.';
