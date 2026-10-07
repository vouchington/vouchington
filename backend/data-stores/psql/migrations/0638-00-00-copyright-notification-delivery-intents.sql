-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
-- Copyright communications are legal records. Delivery is a separate, retryable concern so a
-- transport outage cannot erase the obligation to notify either party.

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TABLE copyright_notice_delivery_work_items (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  copyright_notice_id uuid REFERENCES copyright_notices(id) ON DELETE RESTRICT,
  copyright_notice_email_intake_id uuid CONSTRAINT fk_copyright_notice_delivery_work_items__email_intake REFERENCES copyright_notice_email_intakes(id) ON DELETE RESTRICT,
  copyright_notice_submission_id uuid,
  copyright_notice_correspondence_message_id uuid,
  recipient_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  recipient_user_erased_at timestamptz,
  recipient_role copyright_notice_delivery_intent_recipient_roles NOT NULL CHECK (recipient_role IN ('claimant', 'poster', 'informed_owner', 'correspondent')),
  delivery_kind copyright_notice_delivery_kinds NOT NULL CHECK (delivery_kind IN ('claimant_receipt', 'status_update', 'poster_restriction_notice', 'poster_review_notice', 'poster_restoration_notice', 'owner_information_notice', 'claimant_decision_notice', 'redress_decision_notice', 'counter_notice_forwarding', 'staff_information_request', 'email_intake_rejected', 'email_intake_needs_information', 'email_intake_received')),
  target_path text CHECK (target_path IS NULL OR (char_length(target_path) BETWEEN 1 AND 1024 AND target_path LIKE '/communities/%')),
  channel copyright_notice_delivery_intent_channels NOT NULL CHECK (channel IN ('in_app', 'email')),
  state copyright_notice_delivery_intent_states GENERATED ALWAYS AS (CASE WHEN bounced_at IS NOT NULL THEN 'bounced'::copyright_notice_delivery_intent_states WHEN sent_at IS NOT NULL THEN 'sent'::copyright_notice_delivery_intent_states WHEN failed_at IS NOT NULL THEN 'failed'::copyright_notice_delivery_intent_states WHEN leased_at IS NOT NULL THEN 'claimed'::copyright_notice_delivery_intent_states ELSE 'pending'::copyright_notice_delivery_intent_states END) STORED,
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count BETWEEN 0 AND 5),
  idempotency_key text NOT NULL CHECK (char_length(idempotency_key) BETWEEN 1 AND 512),
  generation bigint NOT NULL DEFAULT 1 CHECK (generation >= 1),
  lease_token uuid,
  lease_expires_at timestamptz,
  leased_at timestamptz,
  delivery_attempted_at timestamptz,
  sent_at timestamptz,
  failed_at timestamptz,
  available_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  bounced_at timestamptz,
  amazon_ses_message_id text CHECK (amazon_ses_message_id IS NULL OR char_length(amazon_ses_message_id) BETWEEN 1 AND 1024),
  failure_ciphertext text CHECK (failure_ciphertext IS NULL OR char_length(failure_ciphertext) BETWEEN 1 AND 1048576),
  body_ciphertext text CHECK (body_ciphertext IS NULL OR char_length(body_ciphertext) BETWEEN 1 AND 1048576),
  created_at timestamptz GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK ((lease_token IS NULL AND leased_at IS NULL AND lease_expires_at IS NULL)
    OR (lease_token IS NOT NULL AND leased_at IS NOT NULL AND lease_expires_at > leased_at)),
  UNIQUE (idempotency_key),
  CONSTRAINT uq_copyri_notice_delive_intents__email_intake_id__delivery_kind UNIQUE (copyright_notice_email_intake_id, delivery_kind),
  CONSTRAINT fk_copyright_notice_delivery_work_items__submission__notice FOREIGN KEY (copyright_notice_submission_id, copyright_notice_id)
    REFERENCES copyright_notice_submissions(id, copyright_notice_id) ON DELETE RESTRICT,
  CONSTRAINT fk_copyri_notice_delive_intents__correspondence_message__notice FOREIGN KEY (copyright_notice_correspondence_message_id, copyright_notice_id)
    REFERENCES copyright_notice_correspondence_messages(id, copyright_notice_id) ON DELETE RESTRICT,
  CHECK (delivery_kind <> 'claimant_decision_notice' OR recipient_role = 'claimant'),
  CHECK (delivery_kind NOT IN ('poster_restriction_notice', 'poster_review_notice', 'poster_restoration_notice') OR recipient_role IN ('poster', 'informed_owner')),
  CHECK (delivery_kind <> 'owner_information_notice' OR recipient_role = 'informed_owner'),
  CHECK ((recipient_role = 'informed_owner') = (target_path IS NOT NULL)),
  CHECK (recipient_role NOT IN ('poster', 'informed_owner') OR recipient_user_id IS NOT NULL OR recipient_user_erased_at IS NOT NULL),
  CHECK (recipient_role <> 'correspondent' OR recipient_user_id IS NULL),
  CHECK (recipient_user_erased_at IS NULL OR recipient_user_id IS NULL),
  CHECK ((state = 'pending' AND leased_at IS NULL AND sent_at IS NULL AND failed_at IS NULL AND bounced_at IS NULL)
    OR (state = 'claimed' AND leased_at IS NOT NULL AND delivery_attempted_at IS NOT NULL AND sent_at IS NULL AND failed_at IS NULL AND bounced_at IS NULL)
    OR (state = 'sent' AND delivery_attempted_at IS NOT NULL AND sent_at IS NOT NULL AND failed_at IS NULL AND bounced_at IS NULL)
    OR (state = 'failed' AND delivery_attempted_at IS NOT NULL AND failed_at IS NOT NULL AND sent_at IS NULL AND bounced_at IS NULL)
    OR (state = 'bounced' AND delivery_attempted_at IS NOT NULL AND sent_at IS NOT NULL AND bounced_at IS NOT NULL AND failed_at IS NULL)),
  CHECK (failure_ciphertext IS NULL OR state IN ('pending', 'failed')),

  CHECK (amazon_ses_message_id IS NULL OR channel = 'email'),
  CHECK (num_nonnulls(copyright_notice_id, copyright_notice_email_intake_id) = 1),
  CHECK (delivery_kind <> 'staff_information_request' OR (recipient_role = 'claimant' AND channel = 'email'
    AND recipient_user_id IS NULL AND copyright_notice_correspondence_message_id IS NOT NULL)),
  CHECK ((copyright_notice_email_intake_id IS NOT NULL) = (delivery_kind IN ('email_intake_rejected', 'email_intake_needs_information', 'email_intake_received'))),
  CHECK ((copyright_notice_email_intake_id IS NOT NULL) = (body_ciphertext IS NOT NULL)),
  CHECK (copyright_notice_email_intake_id IS NULL OR (recipient_role = 'correspondent' AND channel = 'email'
    AND copyright_notice_submission_id IS NULL AND copyright_notice_correspondence_message_id IS NULL))
);

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TABLE copyright_notice_delivery_attempts (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  work_item_id uuid NOT NULL REFERENCES copyright_notice_delivery_work_items(id) ON DELETE CASCADE,
  generation bigint NOT NULL CHECK (generation >= 1),
  attempt_number integer NOT NULL CHECK (attempt_number >= 1),
  lease_token uuid NOT NULL,
  started_at timestamptz NOT NULL,
  created_at timestamptz GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  UNIQUE(work_item_id, attempt_number), UNIQUE(work_item_id, lease_token)
);
CREATE TABLE copyright_notice_delivery_attempt_results (
  attempt_id uuid PRIMARY KEY REFERENCES copyright_notice_delivery_attempts(id) ON DELETE CASCADE,
  sent_at timestamptz,
  failed_at timestamptz,
  bounced_at timestamptz,
  abandoned_at timestamptz,
  CHECK (num_nonnulls(sent_at, failed_at, bounced_at, abandoned_at) = 1)
);
CREATE TRIGGER trigger_copyright_delivery_attempts_immutable BEFORE UPDATE OR DELETE ON copyright_notice_delivery_attempts
FOR EACH ROW EXECUTE FUNCTION fn_reject_mutation();
CREATE TRIGGER trigger_copyright_delivery_attempt_results_immutable BEFORE UPDATE OR DELETE ON copyright_notice_delivery_attempt_results
FOR EACH ROW EXECUTE FUNCTION fn_reject_mutation();
COMMENT ON TABLE copyright_notice_delivery_attempts IS 'Immutable numbered executions across all explicit replay generations; legal work retention owns this history.';
COMMENT ON COLUMN copyright_notice_delivery_attempts.work_item_id IS 'Concrete copyright delivery work whose execution this records.';
COMMENT ON COLUMN copyright_notice_delivery_attempts.generation IS 'Replay generation captured before external execution.';
COMMENT ON COLUMN copyright_notice_delivery_attempts.attempt_number IS 'Monotonically increasing ordinal across retries and replay generations.';
COMMENT ON COLUMN copyright_notice_delivery_attempts.lease_token IS 'Opaque execution ownership token, not an entity reference.';
COMMENT ON COLUMN copyright_notice_delivery_attempts.started_at IS 'Database time this execution acquired its lease.';
COMMENT ON TABLE copyright_notice_delivery_attempt_results IS 'Exactly one immutable terminal result for each claimed execution, including abandonment on takeover.';
COMMENT ON COLUMN copyright_notice_delivery_attempt_results.attempt_id IS 'Execution finalized by this immutable result.';
COMMENT ON COLUMN copyright_notice_delivery_attempt_results.sent_at IS 'Database time this execution ended as sent.';
COMMENT ON COLUMN copyright_notice_delivery_attempt_results.failed_at IS 'Database time this execution ended as failed.';
COMMENT ON COLUMN copyright_notice_delivery_attempt_results.bounced_at IS 'Database time this execution ended as bounced.';
COMMENT ON COLUMN copyright_notice_delivery_attempt_results.abandoned_at IS 'Database time this execution ended as abandoned.';
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE FUNCTION fn_update_copyright_delivery_work() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.available_at := COALESCE(NEW.available_at, clock_timestamp());
  IF TG_OP = 'UPDATE' AND (OLD.failed_at IS NOT NULL AND NEW.failed_at IS NULL) THEN NEW.generation := OLD.generation + 1; END IF;
  IF NEW.sent_at IS NOT NULL OR NEW.failed_at IS NOT NULL OR NEW.bounced_at IS NOT NULL OR NEW.leased_at IS NULL THEN
    NEW.lease_token := NULL; NEW.leased_at := NULL; NEW.lease_expires_at := NULL;
  ELSE
    NEW.lease_token := COALESCE(NEW.lease_token, uuidv7());
    NEW.lease_expires_at := COALESCE(NEW.lease_expires_at, NEW.leased_at + interval '15 minutes');
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trigger_00_copyright_delivery_work_lease BEFORE INSERT OR UPDATE ON copyright_notice_delivery_work_items
FOR EACH ROW EXECUTE FUNCTION fn_update_copyright_delivery_work();
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE FUNCTION fn_create_copyright_delivery_attempt() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.lease_token IS NOT NULL
    AND OLD.lease_token IS DISTINCT FROM NEW.lease_token THEN
    INSERT INTO copyright_notice_delivery_attempt_results(attempt_id, sent_at, failed_at, bounced_at, abandoned_at)
    SELECT id, CASE WHEN NEW.sent_at IS NOT NULL THEN clock_timestamp() ELSE NULL END, CASE WHEN NEW.failed_at IS NOT NULL OR (NEW.lease_token IS NULL AND NEW.failure_ciphertext IS NOT NULL AND NOT (NEW.sent_at IS NOT NULL OR NEW.failed_at IS NOT NULL OR NEW.bounced_at IS NOT NULL)) THEN clock_timestamp() ELSE NULL END, CASE WHEN NEW.bounced_at IS NOT NULL THEN clock_timestamp() ELSE NULL END, CASE WHEN (NEW.sent_at IS NOT NULL OR NEW.failed_at IS NOT NULL OR NEW.bounced_at IS NOT NULL OR NEW.lease_token IS NULL AND NEW.failure_ciphertext IS NOT NULL) IS NOT TRUE THEN clock_timestamp() ELSE NULL END
    FROM copyright_notice_delivery_attempts WHERE work_item_id = OLD.id AND lease_token = OLD.lease_token
    ON CONFLICT (attempt_id) DO NOTHING;
  END IF;
  IF NEW.lease_token IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.lease_token IS DISTINCT FROM OLD.lease_token) THEN
    INSERT INTO copyright_notice_delivery_attempts(work_item_id, generation, attempt_number, lease_token, started_at)
      SELECT NEW.id, NEW.generation, COALESCE(MAX(attempt_number), 0) + 1, NEW.lease_token, NEW.leased_at
      FROM copyright_notice_delivery_attempts WHERE work_item_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trigger_copyright_delivery_work_attempt AFTER INSERT OR UPDATE ON copyright_notice_delivery_work_items
FOR EACH ROW EXECUTE FUNCTION fn_create_copyright_delivery_attempt();
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX idx_copyright_notice_delivery_work_items__available ON copyright_notice_delivery_work_items(available_at, id) WHERE lease_token IS NULL AND state = 'pending';
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX idx_copyright_notice_delivery_work_items__expired ON copyright_notice_delivery_work_items(lease_expires_at, id) WHERE lease_token IS NOT NULL;
COMMENT ON COLUMN copyright_notice_delivery_work_items.generation IS 'Explicit replay cycle; clearing failed or blocked current-cycle outcomes increments it while execution history remains immutable.';
COMMENT ON COLUMN copyright_notice_delivery_work_items.lease_expires_at IS 'Current worker ownership deadline; every owner mutation checks it.';


ALTER TABLE copyright_notice_lifecycle_changes
  ADD CONSTRAINT copyright_lifecycle_event_delivery_intent_fk
  FOREIGN KEY (copyright_notice_delivery_work_item_id)
  REFERENCES copyright_notice_delivery_work_items(id) ON DELETE RESTRICT NOT VALID;
ALTER TABLE copyright_notice_lifecycle_changes
  VALIDATE CONSTRAINT copyright_lifecycle_event_delivery_intent_fk;

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX idx_copyright_notice_delivery_work_items__notice
  ON copyright_notice_delivery_work_items (copyright_notice_id, id);
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX idx_copyright_notice_delivery_work_items__submission
  ON copyright_notice_delivery_work_items (copyright_notice_submission_id, copyright_notice_id)
  WHERE copyright_notice_submission_id IS NOT NULL;
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX idx_copyright_notice_delivery_work_items__correspondence
  ON copyright_notice_delivery_work_items (copyright_notice_correspondence_message_id, copyright_notice_id)
  WHERE copyright_notice_correspondence_message_id IS NOT NULL;
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX idx_copyright_notice_delivery_work_items__recipient_user
  ON copyright_notice_delivery_work_items (recipient_user_id)
  WHERE recipient_user_id IS NOT NULL;
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX idx_copyright_notice_delivery_work_items__amazon_ses_message
  ON copyright_notice_delivery_work_items (amazon_ses_message_id) WHERE amazon_ses_message_id IS NOT NULL;

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE OR REPLACE FUNCTION fn_reject_copyright_delivery_intent_transition()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE next_state copyright_notice_delivery_intent_states;
BEGIN
  next_state := CASE WHEN NEW.bounced_at IS NOT NULL THEN 'bounced'::copyright_notice_delivery_intent_states WHEN NEW.sent_at IS NOT NULL THEN 'sent'::copyright_notice_delivery_intent_states WHEN NEW.failed_at IS NOT NULL THEN 'failed'::copyright_notice_delivery_intent_states WHEN NEW.leased_at IS NOT NULL THEN 'claimed'::copyright_notice_delivery_intent_states ELSE 'pending'::copyright_notice_delivery_intent_states END;
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'copyright delivery intents are retained' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.copyright_notice_id IS DISTINCT FROM OLD.copyright_notice_id
    OR NEW.copyright_notice_email_intake_id IS DISTINCT FROM OLD.copyright_notice_email_intake_id
    OR NEW.copyright_notice_submission_id IS DISTINCT FROM OLD.copyright_notice_submission_id
    OR NEW.copyright_notice_correspondence_message_id IS DISTINCT FROM OLD.copyright_notice_correspondence_message_id
    OR NEW.recipient_role IS DISTINCT FROM OLD.recipient_role
    OR NEW.delivery_kind IS DISTINCT FROM OLD.delivery_kind
    OR NEW.target_path IS DISTINCT FROM OLD.target_path
    OR NEW.channel IS DISTINCT FROM OLD.channel
    OR NEW.body_ciphertext IS DISTINCT FROM OLD.body_ciphertext
    OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key THEN
    RAISE EXCEPTION 'copyright delivery intent facts are immutable' USING ERRCODE = 'check_violation';
  END IF;
  IF (OLD.sent_at IS NOT NULL AND (NEW.sent_at IS DISTINCT FROM OLD.sent_at
      OR NEW.amazon_ses_message_id IS DISTINCT FROM OLD.amazon_ses_message_id))
    OR (OLD.bounced_at IS NOT NULL AND NEW.bounced_at IS DISTINCT FROM OLD.bounced_at)
    OR (OLD.failed_at IS NOT NULL AND NEW.failed_at IS NOT NULL AND NEW.failed_at IS DISTINCT FROM OLD.failed_at) THEN
    RAISE EXCEPTION 'terminal copyright delivery intent cannot change' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.recipient_user_id IS DISTINCT FROM NEW.recipient_user_id THEN
    IF OLD.recipient_user_id IS NULL OR NEW.recipient_user_id IS NOT NULL THEN
      RAISE EXCEPTION 'copyright delivery recipient cannot change' USING ERRCODE = 'check_violation';
    END IF;
    NEW.recipient_user_erased_at := CURRENT_TIMESTAMP;
  ELSIF NEW.recipient_user_erased_at IS DISTINCT FROM OLD.recipient_user_erased_at THEN
    RAISE EXCEPTION 'copyright delivery recipient erasure is system-managed' USING ERRCODE = 'check_violation';
  END IF;
  IF (OLD.state IN ('bounced', 'failed') AND next_state IS DISTINCT FROM OLD.state)
    OR (OLD.state = 'sent' AND next_state NOT IN ('sent', 'bounced')) THEN
    RAISE EXCEPTION 'terminal copyright delivery intent cannot change' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TRIGGER trigger_copyright_delivery_intent_transition
BEFORE UPDATE OR DELETE ON copyright_notice_delivery_work_items
FOR EACH ROW EXECUTE FUNCTION fn_reject_copyright_delivery_intent_transition();
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TRIGGER trigger_copyright_delivery_intents_updated_at
BEFORE UPDATE ON copyright_notice_delivery_work_items
FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();

COMMENT ON TABLE copyright_notice_delivery_work_items IS 'Durable, idempotent legal-notice delivery obligations, including statements of reasons, decision notices, authenticated arrival receipts, and private replies to rejected email intakes. Transport workers claim and transition intents; they cannot alter case facts.';
COMMENT ON COLUMN copyright_notice_delivery_work_items.copyright_notice_id IS 'Copyright case that owns the delivery obligation; NULL for a reply to a declined email intake, which never creates a case.';
COMMENT ON COLUMN copyright_notice_delivery_work_items.copyright_notice_email_intake_id IS 'Private inbound email this receipt or reply answers; exactly one of this and copyright_notice_id is set, and at most one delivery of each kind exists per intake.';
COMMENT ON COLUMN copyright_notice_delivery_work_items.body_ciphertext IS 'Immutable encrypted receipt or reply body sent for an email intake, so every retry sends the same legal text; NULL for case deliveries.';
COMMENT ON COLUMN copyright_notice_delivery_work_items.copyright_notice_submission_id IS 'Optional immutable submission that caused the delivery.';
COMMENT ON COLUMN copyright_notice_delivery_work_items.copyright_notice_correspondence_message_id IS 'Optional private correspondence body delivered by this obligation.';
COMMENT ON COLUMN copyright_notice_delivery_work_items.recipient_user_id IS 'Voucha user receiving the notice when the recipient has an account.';
COMMENT ON COLUMN copyright_notice_delivery_work_items.recipient_user_erased_at IS 'Time account erasure removed a poster recipient reference while retaining the legal delivery record.';
COMMENT ON COLUMN copyright_notice_delivery_work_items.recipient_role IS 'Legal role of the recipient: claimant, affected poster or setter, informed community owner, or external email correspondent.';
COMMENT ON COLUMN copyright_notice_delivery_work_items.delivery_kind IS 'Legal event communicated by this delivery. staff_information_request emails the notice claimant a staff request for more information and always references its immutable correspondence message.';
COMMENT ON COLUMN copyright_notice_delivery_work_items.target_path IS 'Immutable community URL selected when an informed-owner obligation is created; delivery does not derive a relationship from the idempotency key.';
COMMENT ON COLUMN copyright_notice_delivery_work_items.channel IS 'Transport channel used for the delivery.';
COMMENT ON COLUMN copyright_notice_delivery_work_items.state IS 'Durable transport lifecycle state.';
COMMENT ON COLUMN copyright_notice_delivery_work_items.attempt_count IS 'Number of claimed transport attempts, capped to prevent an unhealthy obligation starving other delivery work.';
COMMENT ON COLUMN copyright_notice_delivery_work_items.idempotency_key IS 'Stable domain key preventing duplicate delivery obligations.';
COMMENT ON COLUMN copyright_notice_delivery_work_items.leased_at IS 'Time a transport worker most recently claimed the obligation.';
COMMENT ON COLUMN copyright_notice_delivery_work_items.delivery_attempted_at IS 'Time the terminal transport attempt began.';
COMMENT ON COLUMN copyright_notice_delivery_work_items.sent_at IS 'Time the provider accepted the delivery.';
COMMENT ON COLUMN copyright_notice_delivery_work_items.failed_at IS 'Time the most recent retryable transport attempt failed.';
COMMENT ON COLUMN copyright_notice_delivery_work_items.available_at IS 'Earliest retry time after a retryable transport failure; NULL for terminal states.';
COMMENT ON COLUMN copyright_notice_delivery_work_items.bounced_at IS 'Time SES reported a bounce or complaint for an accepted email.';
COMMENT ON COLUMN copyright_notice_delivery_work_items.amazon_ses_message_id IS 'SES provider identifier used to correlate delivery feedback.';
COMMENT ON COLUMN copyright_notice_delivery_work_items.failure_ciphertext IS 'Encrypted bounded transport failure visible to staff; retries retain the failure history through lifecycle events.';

-- Current indexes for fresh schema bootstrap.
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX IF NOT EXISTS idx_copyright_notice_delivery_work_items__recoverable
  ON copyright_notice_delivery_work_items (channel, id)
  WHERE state IN ('pending', 'claimed');

COMMENT ON COLUMN copyright_notice_delivery_work_items.lease_token IS 'Opaque worker ownership token rotated on each claim or reclaim; completion and failure compare it for equality. It identifies no durable row.';
