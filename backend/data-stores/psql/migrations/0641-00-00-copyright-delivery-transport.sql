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
