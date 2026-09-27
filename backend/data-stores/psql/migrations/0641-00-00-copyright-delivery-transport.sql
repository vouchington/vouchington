-- Delivery recipients and notification bindings are deliberately separate from the immutable
-- notice snapshot. A transport can only decrypt a recipient encrypted specifically for its
-- durable intent; it never guesses the purpose of claimant evidence.

ALTER TABLE notifications
  ADD CONSTRAINT fk_notifications__copyright_notice
  FOREIGN KEY (copyright_notice_id)
  REFERENCES copyright_notices(id) ON DELETE RESTRICT NOT VALID;
ALTER TABLE notifications
  VALIDATE CONSTRAINT fk_notifications__copyright_notice;
CREATE INDEX idx_notifications__copyright_notice
  ON notifications (copyright_notice_id) WHERE copyright_notice_id IS NOT NULL;

CREATE TABLE copyright_notice_delivery_recipients (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  copyright_notice_delivery_intent_id uuid NOT NULL UNIQUE
    REFERENCES copyright_notice_delivery_intents(id) ON DELETE RESTRICT,
  email_ciphertext text NOT NULL CHECK (char_length(email_ciphertext) BETWEEN 1 AND 1048576),
  created_at timestamptz GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Current automatic authority depends on the receipt and its retained recipient above.
CREATE OR REPLACE FUNCTION fn_current_copyright_form_screening(submission_id uuid, screening_id uuid)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM copyright_notice_form_intakes intake
    JOIN copyright_notice_form_screening_executions execution
      ON execution.copyright_notice_form_intake_id = intake.id AND execution.state = 'completed'
    JOIN copyright_notice_form_screenings screening
      ON screening.id = execution.copyright_notice_form_screening_id
    JOIN copyright_notice_submissions submission ON submission.id = intake.copyright_notice_submission_id
    JOIN copyright_notices notice ON notice.id = intake.copyright_notice_id
    WHERE submission.id = submission_id AND screening.id = screening_id
      AND screening.recommendation = 'not_obviously_invalid'
      AND submission.kind = 'notice' AND submission.source_kind = 'signed_in_form'
      AND intake.requester_user_id IS NOT NULL AND notice.jurisdiction = 'us_dmca'
      AND char_length(notice.claimant_contact_ciphertext) > 0
      AND char_length(btrim(notice.work_description)) > 0
      AND intake.good_faith_belief AND intake.accuracy_authority_under_penalty_of_perjury
      AND char_length(intake.electronic_signature_ciphertext) > 0
      AND EXISTS (
        SELECT 1 FROM copyright_notice_targets target
        JOIN copyright_notice_target_images image ON image.copyright_notice_target_id = target.id
        WHERE target.copyright_notice_id = notice.id AND char_length(btrim(target.hosted_use_url)) > 0
      )
      AND EXISTS (
        SELECT 1 FROM copyright_notice_delivery_intents receipt
        JOIN copyright_notice_delivery_recipients recipient ON recipient.copyright_notice_delivery_intent_id = receipt.id
        WHERE receipt.copyright_notice_id = notice.id AND receipt.recipient_role = 'claimant'
          AND receipt.channel = 'email' AND receipt.delivery_kind = 'claimant_receipt'
      )
      AND NOT EXISTS (
        SELECT 1 FROM copyright_notice_form_intake_reviews review
        WHERE review.copyright_notice_form_intake_id = intake.id AND NOT review.accepted
      )
  );
$$;

CREATE OR REPLACE FUNCTION fn_guard_copyright_automated_assessment_screening()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.assessed_by_id IS NOT NULL
    AND NEW.assessed_by_id IS NULL AND NEW.copyright_notice_form_screening_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.assessed_by_id IS NULL AND NOT fn_current_copyright_form_screening(
    NEW.copyright_notice_submission_id, NEW.copyright_notice_form_screening_id
  ) THEN
    RAISE EXCEPTION 'automated copyright assessment requires its current completed screen and complete structured US DMCA notice'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.assessed_by_id IS NOT NULL AND NEW.copyright_notice_form_screening_id IS NOT NULL THEN
    RAISE EXCEPTION 'human copyright assessment cannot claim an automated form screening'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_copyright_automated_assessment_screening
BEFORE INSERT OR UPDATE OF assessed_by_id, copyright_notice_form_screening_id
ON copyright_notice_submission_assessments
FOR EACH ROW EXECUTE FUNCTION fn_guard_copyright_automated_assessment_screening();

CREATE TRIGGER trigger_copyright_delivery_recipients_immutable
BEFORE UPDATE OR DELETE ON copyright_notice_delivery_recipients
FOR EACH ROW EXECUTE FUNCTION fn_guard_copyright_notice_immutable_evidence();
CREATE TRIGGER trigger_copyright_delivery_recipients_updated_at
BEFORE UPDATE ON copyright_notice_delivery_recipients
FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();

-- Email has no safe body outside the immutable correspondence record. Keep that relationship
-- enforceable at the database boundary rather than relying on a worker convention.
ALTER TABLE copyright_notice_delivery_intents
  ADD CONSTRAINT copyright_delivery_intents_email_correspondence
  CHECK (channel <> 'email' OR copyright_notice_correspondence_message_id IS NOT NULL)
  NOT VALID;
ALTER TABLE copyright_notice_delivery_intents
  VALIDATE CONSTRAINT copyright_delivery_intents_email_correspondence;

COMMENT ON COLUMN notifications.copyright_notice_id IS 'Private copyright case associated with a member notification; the notification body contains no claimant or evidence data.';
COMMENT ON TABLE copyright_notice_delivery_recipients IS 'Intent-scoped encrypted email recipients for legal delivery. This avoids reusing or guessing evidence-encryption purposes.';
COMMENT ON COLUMN copyright_notice_delivery_recipients.copyright_notice_delivery_intent_id IS 'Email delivery obligation that owns this recipient address.';
COMMENT ON COLUMN copyright_notice_delivery_recipients.email_ciphertext IS 'Intent-scoped encrypted recipient email address.';
