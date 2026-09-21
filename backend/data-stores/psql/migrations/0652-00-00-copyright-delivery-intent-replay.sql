-- Staff replay reopens a failed delivery obligation. Bounced mail stays terminal.

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
  IF OLD.state = 'bounced' AND NEW.state IS DISTINCT FROM OLD.state THEN
    RAISE EXCEPTION 'terminal copyright delivery intent cannot change' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.state = 'failed' AND NEW.state IS DISTINCT FROM OLD.state
    AND NOT (
      NEW.state = 'pending' AND NEW.claimed_at IS NULL AND NEW.failed_at IS NULL
      AND NEW.next_attempt_at IS NULL AND NEW.delivery_attempt_count = 0
    ) THEN
    RAISE EXCEPTION 'failed copyright delivery intents may only be explicitly replayed'
      USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.state = 'sent' AND NEW.state NOT IN ('sent', 'bounced') THEN
    RAISE EXCEPTION 'terminal copyright delivery intent cannot change' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
