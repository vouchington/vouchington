-- edited-in-place: pre-launch, never deployed to production
CREATE TABLE IF NOT EXISTS support_inbound_email_receipts (
  ses_message_id TEXT PRIMARY KEY,
  s3_object_key TEXT NOT NULL UNIQUE,
  email_message_id TEXT,
  support_thread_id UUID,
  support_message_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  processed_at TIMESTAMPTZ,
  embedding_enqueued_at TIMESTAMPTZ,
  customer_support_enqueued_at TIMESTAMPTZ,
  customer_support_completed_at TIMESTAMPTZ,

  CONSTRAINT chk_support_inbound_email_receipts__processed
    CHECK (
      (support_thread_id IS NULL AND support_message_id IS NULL AND processed_at IS NULL) OR
      (support_thread_id IS NOT NULL AND support_message_id IS NOT NULL AND processed_at IS NOT NULL)
    ),
  CONSTRAINT chk_support_inbound_email_receipts__follow_ups
    CHECK (
      (embedding_enqueued_at IS NULL OR processed_at IS NOT NULL) AND
      (customer_support_enqueued_at IS NULL OR processed_at IS NOT NULL) AND
      (customer_support_completed_at IS NULL OR customer_support_enqueued_at IS NOT NULL)
    ),
  FOREIGN KEY (support_thread_id, support_message_id)
    REFERENCES support_messages (support_thread_id, id) ON DELETE CASCADE,
  FOREIGN KEY (email_message_id)
    REFERENCES support_inbound_email_message_ids (email_message_id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_support_inbound_email_receipts__message
  ON support_inbound_email_receipts (support_thread_id, support_message_id)
  WHERE support_thread_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_support_inbound_email_receipts__customer_support_recovery
  ON support_inbound_email_receipts (support_message_id)
  WHERE processed_at IS NOT NULL
    AND support_thread_id IS NOT NULL
    AND support_message_id IS NOT NULL
    AND customer_support_completed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_support_inbound_email_receipts__email_message_id
  ON support_inbound_email_receipts (email_message_id)
  WHERE email_message_id IS NOT NULL;

CREATE TRIGGER trigger_support_inbound_email_receipts_updated_at
  BEFORE UPDATE ON support_inbound_email_receipts
  FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();

COMMENT ON TABLE support_inbound_email_receipts IS 'Durable idempotency and completion receipts for raw SES support emails stored in S3.';
COMMENT ON COLUMN support_inbound_email_receipts.ses_message_id IS 'SES receipt message ID used as the durable delivery identity.';
COMMENT ON COLUMN support_inbound_email_receipts.s3_object_key IS 'Original incoming S3 object key for the raw MIME message.';
COMMENT ON COLUMN support_inbound_email_receipts.email_message_id IS 'Optional RFC Message-ID associated with the persisted support message.';
COMMENT ON COLUMN support_inbound_email_receipts.support_thread_id IS 'Support thread containing the persisted inbound message.';
COMMENT ON COLUMN support_inbound_email_receipts.support_message_id IS 'Persisted inbound support message created for this SES delivery.';
COMMENT ON COLUMN support_inbound_email_receipts.processed_at IS 'When the receipt was linked to a persisted support message.';
COMMENT ON COLUMN support_inbound_email_receipts.embedding_enqueued_at IS 'When the support-message embedding job was awaited successfully.';
COMMENT ON COLUMN support_inbound_email_receipts.customer_support_enqueued_at IS 'When the customer-support agent job was awaited successfully.';
COMMENT ON COLUMN support_inbound_email_receipts.customer_support_completed_at IS 'When the keyed customer-support agent run completed durably.';
