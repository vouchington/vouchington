-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
-- Staff replay reopens a failed delivery obligation. Bounced mail stays terminal.

CREATE OR REPLACE FUNCTION fn_reject_copyright_delivery_intent_transition()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE next_state copyright_notice_delivery_intent_states;
BEGIN
  next_state := CASE WHEN NEW.bounced_at IS NOT NULL THEN 'bounced'::copyright_notice_delivery_intent_states WHEN NEW.sent_at IS NOT NULL THEN 'sent'::copyright_notice_delivery_intent_states WHEN NEW.failed_at IS NOT NULL THEN 'failed'::copyright_notice_delivery_intent_states WHEN NEW.leased_at IS NOT NULL THEN 'claimed'::copyright_notice_delivery_intent_states ELSE 'pending'::copyright_notice_delivery_intent_states END;
  IF TG_OP = 'UPDATE' AND current_setting('app.copyright_retention_erasure', true) = 'on' THEN
    IF fn_copyright_retention_erasure_permitted(TG_TABLE_NAME, to_jsonb(OLD), to_jsonb(NEW)) THEN RETURN NEW; END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'copyright delivery intents are retained' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.copyright_notice_id IS DISTINCT FROM OLD.copyright_notice_id
    OR NEW.copyright_notice_email_intake_id IS DISTINCT FROM OLD.copyright_notice_email_intake_id
    OR NEW.copyright_notice_submission_id IS DISTINCT FROM OLD.copyright_notice_submission_id
    OR NEW.copyright_notice_correspondence_message_id IS DISTINCT FROM OLD.copyright_notice_correspondence_message_id
    OR NEW.recipient_role IS DISTINCT FROM OLD.recipient_role
    OR NEW.delivery_kind IS DISTINCT FROM OLD.delivery_kind
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
  IF OLD.state = 'bounced' AND next_state IS DISTINCT FROM OLD.state THEN
    RAISE EXCEPTION 'terminal copyright delivery intent cannot change' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.state = 'failed' AND next_state IS DISTINCT FROM OLD.state
    AND NOT (
      next_state = 'pending' AND NEW.leased_at IS NULL AND NEW.failed_at IS NULL
      AND NEW.available_at IS NOT NULL AND NEW.attempt_count = 0
    ) THEN
    RAISE EXCEPTION 'failed copyright delivery intents may only be explicitly replayed'
      USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.state = 'sent' AND next_state NOT IN ('sent', 'bounced') THEN
    RAISE EXCEPTION 'terminal copyright delivery intent cannot change' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
