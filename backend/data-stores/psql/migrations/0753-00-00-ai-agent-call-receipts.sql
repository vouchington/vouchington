-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
-- Reserve the logical decision before a paid provider request. An interrupted request may have
-- been billed, so its empty result must be reviewed rather than dispatched again.
CREATE TYPE ai_agent_call_receipt_agent_slugs AS ENUM (
  'story-post',
  'report-judgement',
  'copyright-submission-guidance',
  'copyright-appeal-recommendation'
);
COMMENT ON TYPE ai_agent_call_receipt_agent_slugs IS 'Closed set of paid agent workloads that use durable call receipts.';

CREATE TYPE ai_agent_call_receipt_statuses AS ENUM ('in_flight', 'done', 'erased');
COMMENT ON TYPE ai_agent_call_receipt_statuses IS 'Explicit paid-call result lifecycle; an in-flight call may have been billed.';

-- Keep the exact operation key after an operator retires a receipt partition. This small retained
-- identity remains the paid-call reservation gate; it does not authorize replay of an erased result.
CREATE TABLE ai_agent_call_receipt_keys (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  operation_key TEXT NOT NULL UNIQUE CHECK (char_length(operation_key) = 64),
  request_sha256 TEXT NOT NULL CHECK (char_length(request_sha256) = 64),
  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL
);
COMMENT ON TABLE ai_agent_call_receipt_keys IS 'Retained paid-operation identities that prevent duplicate dispatch after receipt partition retirement.';
COMMENT ON COLUMN ai_agent_call_receipt_keys.id IS 'UUIDv7 identity shared with the optional live receipt.';
COMMENT ON COLUMN ai_agent_call_receipt_keys.operation_key IS 'SHA-256 of the agent and stable logical operation identity.';
COMMENT ON COLUMN ai_agent_call_receipt_keys.request_sha256 IS 'SHA-256 of the exact reserved provider input and model contract.';
COMMENT ON COLUMN ai_agent_call_receipt_keys.created_at IS 'Creation time derived from the UUIDv7 identity.';

CREATE TABLE IF NOT EXISTS ai_agent_call_receipts (
  id UUID PRIMARY KEY REFERENCES ai_agent_call_receipt_keys (id) ON DELETE CASCADE,
  agent_slug ai_agent_call_receipt_agent_slugs NOT NULL,
  status ai_agent_call_receipt_statuses NOT NULL DEFAULT 'in_flight',
  copyright_notice_submission_id UUID,
  post_id UUID,
  reported_user_id UUID,
  hostname_id UUID,
  rss_feed_item_id UUID,
  result_ciphertext TEXT,
  completed_at TIMESTAMPTZ,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  CHECK ((agent_slug IN ('copyright-submission-guidance', 'copyright-appeal-recommendation'))
    = (copyright_notice_submission_id IS NOT NULL)),
  CHECK ((status = 'done' AND result_ciphertext IS NOT NULL AND char_length(result_ciphertext) > 0)
    OR (status IN ('in_flight', 'erased') AND result_ciphertext IS NULL)),
  CHECK (status <> 'done' OR completed_at IS NOT NULL),
  CHECK (consumed_at IS NULL OR status IN ('done', 'erased')),
  CHECK (CASE WHEN agent_slug = 'report-judgement'
    THEN num_nonnulls(post_id, reported_user_id, hostname_id, rss_feed_item_id) = 1
      OR (num_nonnulls(post_id, reported_user_id, hostname_id, rss_feed_item_id) = 0
        AND status = 'erased')
    ELSE num_nonnulls(post_id, reported_user_id, hostname_id, rss_feed_item_id) = 0 END)
) PARTITION BY RANGE (id);

ALTER TABLE moderation_report_judgements
  ADD CONSTRAINT fk_moderation_report_judgements__agent_call_receipt
  FOREIGN KEY (agent_call_receipt_id)
  REFERENCES ai_agent_call_receipts (id) ON DELETE CASCADE NOT VALID;
ALTER TABLE moderation_report_judgements
  VALIDATE CONSTRAINT fk_moderation_report_judgements__agent_call_receipt;

ALTER TABLE ai_agent_call_receipts
  ADD CONSTRAINT fk_ai_agent_call_receipts__copyright_notice_submission
  FOREIGN KEY (copyright_notice_submission_id)
  REFERENCES copyright_notice_submissions (id) ON DELETE RESTRICT NOT VALID;
ALTER TABLE ai_agent_call_receipts
  VALIDATE CONSTRAINT fk_ai_agent_call_receipts__copyright_notice_submission;

CREATE INDEX idx_ai_agent_call_receipts__copyright_submission
  ON ai_agent_call_receipts (copyright_notice_submission_id)
  WHERE copyright_notice_submission_id IS NOT NULL;

ALTER TABLE ai_agent_call_receipts
  ADD CONSTRAINT fk_ai_agent_call_receipts__post
  FOREIGN KEY (post_id) REFERENCES posts (id) ON DELETE SET NULL NOT VALID;
ALTER TABLE ai_agent_call_receipts
  VALIDATE CONSTRAINT fk_ai_agent_call_receipts__post;
CREATE INDEX idx_ai_agent_call_receipts__post
  ON ai_agent_call_receipts (post_id) WHERE post_id IS NOT NULL;

ALTER TABLE ai_agent_call_receipts
  ADD CONSTRAINT fk_ai_agent_call_receipts__reported_user
  FOREIGN KEY (reported_user_id) REFERENCES users (id) ON DELETE SET NULL NOT VALID;
ALTER TABLE ai_agent_call_receipts
  VALIDATE CONSTRAINT fk_ai_agent_call_receipts__reported_user;
CREATE INDEX idx_ai_agent_call_receipts__reported_user
  ON ai_agent_call_receipts (reported_user_id) WHERE reported_user_id IS NOT NULL;

ALTER TABLE ai_agent_call_receipts
  ADD CONSTRAINT fk_ai_agent_call_receipts__hostname
  FOREIGN KEY (hostname_id) REFERENCES url_hostnames (id) ON DELETE SET NULL NOT VALID;
ALTER TABLE ai_agent_call_receipts
  VALIDATE CONSTRAINT fk_ai_agent_call_receipts__hostname;
CREATE INDEX idx_ai_agent_call_receipts__hostname
  ON ai_agent_call_receipts (hostname_id) WHERE hostname_id IS NOT NULL;

ALTER TABLE ai_agent_call_receipts
  ADD CONSTRAINT fk_ai_agent_call_receipts__rss_feed_item
  FOREIGN KEY (rss_feed_item_id) REFERENCES rss_feed_items (id) ON DELETE SET NULL NOT VALID;
ALTER TABLE ai_agent_call_receipts
  VALIDATE CONSTRAINT fk_ai_agent_call_receipts__rss_feed_item;
CREATE INDEX idx_ai_agent_call_receipts__rss_feed_item
  ON ai_agent_call_receipts (rss_feed_item_id) WHERE rss_feed_item_id IS NOT NULL;

CREATE INDEX idx_ai_agent_call_receipts__ciphertext_retention
  ON ai_agent_call_receipts (id) WHERE status = 'done';
CREATE INDEX idx_ai_agent_call_receipts__in_flight
  ON ai_agent_call_receipts (id) WHERE status = 'in_flight';

CREATE TABLE ai_agent_receipt_retention_cursors (
  is_singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (is_singleton),
  cursor_receipt_id UUID,
  sweep_upper_bound_receipt_id UUID,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (cursor_receipt_id IS NULL OR sweep_upper_bound_receipt_id IS NOT NULL)
);
CREATE OR REPLACE TRIGGER trigger_ai_agent_receipt_retention_cursors_updated_at
BEFORE UPDATE ON ai_agent_receipt_retention_cursors
FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();
COMMENT ON TABLE ai_agent_receipt_retention_cursors IS 'Singleton UUIDv7 keyset position for paid-call ciphertext erasure.';
COMMENT ON COLUMN ai_agent_receipt_retention_cursors.is_singleton IS 'Allows one paid-call receipt erasure sweep position.';
COMMENT ON COLUMN ai_agent_receipt_retention_cursors.cursor_receipt_id IS 'Last scanned receipt identity.';
COMMENT ON COLUMN ai_agent_receipt_retention_cursors.sweep_upper_bound_receipt_id IS 'Frozen exclusive UUIDv7 age bound for the current sweep.';
COMMENT ON COLUMN ai_agent_receipt_retention_cursors.updated_at IS 'Last cursor transition time.';

-- A deleted report target erases the encrypted answer without forgetting that the operation
-- was paid. SET NULL takes the receipt row lock, serializing deletion with result completion.
CREATE OR REPLACE FUNCTION fn_update_report_agent_call_receipt_target() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.agent_slug = 'report-judgement'
      AND num_nonnulls(NEW.post_id, NEW.reported_user_id, NEW.hostname_id, NEW.rss_feed_item_id) <> 1 THEN
      RAISE EXCEPTION 'Report call receipts require exactly one live target';
    END IF;
  ELSIF OLD.status = 'erased'
    OR (OLD.agent_slug = 'report-judgement'
      AND num_nonnulls(OLD.post_id, OLD.reported_user_id, OLD.hostname_id, OLD.rss_feed_item_id) = 1
      AND num_nonnulls(NEW.post_id, NEW.reported_user_id, NEW.hostname_id, NEW.rss_feed_item_id) = 0) THEN
    NEW.result_ciphertext := NULL;
    NEW.status := 'erased';
  END IF;
  RETURN NEW;
END;
$$;
COMMENT ON FUNCTION fn_update_report_agent_call_receipt_target() IS 'Requires an initial report target and irreversibly tombstones a receipt when its target is hard-deleted.';
CREATE TRIGGER trigger_erase_report_agent_call_receipt_target
  BEFORE INSERT OR UPDATE ON ai_agent_call_receipts
  FOR EACH ROW EXECUTE FUNCTION fn_update_report_agent_call_receipt_target();

COMMENT ON TABLE ai_agent_call_receipts IS 'RANGE-partitioned paid-call receipts; only a default child is created initially, and operators may split and retire explicit UUIDv7 ranges after checking for in-flight calls.';
COMMENT ON COLUMN ai_agent_call_receipts.id IS 'UUIDv7 receipt identity and creation order.';
COMMENT ON COLUMN ai_agent_call_receipts.agent_slug IS 'Agent that reserved the paid call.';
COMMENT ON COLUMN ai_agent_call_receipts.status IS 'In-flight may have been billed; done can replay its ciphertext; erased cannot replay or dispatch again.';
COMMENT ON COLUMN ai_agent_call_receipts.copyright_notice_submission_id IS 'Retention owner for copyright guidance and appeal results; null for other agents.';
COMMENT ON COLUMN ai_agent_call_receipts.result_ciphertext IS 'Encrypted provider result available only while status is done; erased after retention.';
COMMENT ON COLUMN ai_agent_call_receipts.consumed_at IS 'Set atomically with a durable report judgement after its encrypted answer has been applied; permits later ciphertext erasure without losing the exact replay gate.';
COMMENT ON COLUMN ai_agent_call_receipts.completed_at IS 'When the paid model result became durable; ciphertext erasure waits 30 days from this event.';
COMMENT ON COLUMN ai_agent_call_receipts.created_at IS 'Creation time derived from the UUIDv7 receipt identity.';
COMMENT ON COLUMN ai_agent_call_receipts.post_id IS 'Reported post or comment; hard deletion erases the result while retaining the paid operation key.';
COMMENT ON COLUMN ai_agent_call_receipts.reported_user_id IS 'Reported user; hard deletion erases the result while retaining the paid operation key.';
COMMENT ON COLUMN ai_agent_call_receipts.hostname_id IS 'Reported URL hostname; hard deletion erases the result while retaining the paid operation key.';
COMMENT ON COLUMN ai_agent_call_receipts.rss_feed_item_id IS 'Reported RSS feed item; hard deletion erases the result while retaining the paid operation key.';
