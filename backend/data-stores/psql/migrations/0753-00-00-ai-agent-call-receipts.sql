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

CREATE TABLE IF NOT EXISTS ai_agent_call_receipts (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  operation_key TEXT NOT NULL UNIQUE,
  agent_slug ai_agent_call_receipt_agent_slugs NOT NULL,
  request_sha256 TEXT NOT NULL,
  copyright_notice_submission_id UUID,
  post_id UUID,
  reported_user_id UUID,
  hostname_id UUID,
  rss_feed_item_id UUID,
  result_ciphertext TEXT,
  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  CHECK (char_length(operation_key) = 64),
  CHECK (char_length(request_sha256) = 64),
  CHECK ((agent_slug IN ('copyright-submission-guidance', 'copyright-appeal-recommendation'))
    = (copyright_notice_submission_id IS NOT NULL)),
  CHECK (result_ciphertext IS NULL OR char_length(result_ciphertext) > 0),
  CHECK (CASE
    WHEN agent_slug = 'report-judgement' THEN
      num_nonnulls(post_id, reported_user_id, hostname_id, rss_feed_item_id) = 1
      OR (num_nonnulls(post_id, reported_user_id, hostname_id, rss_feed_item_id) = 0
        AND result_ciphertext IS NOT DISTINCT FROM 'erased')
    WHEN agent_slug = 'story-post' THEN
      num_nonnulls(reported_user_id, hostname_id, rss_feed_item_id) = 0
      AND (post_id IS NOT NULL
        OR (post_id IS NULL AND result_ciphertext IS NOT DISTINCT FROM 'erased'))
    ELSE num_nonnulls(post_id, reported_user_id, hostname_id, rss_feed_item_id) = 0
  END)
);

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

-- A deleted report target or story post erases the encrypted answer without forgetting that the
-- operation was paid. SET NULL takes the receipt row lock, serializing deletion with result completion.
CREATE OR REPLACE FUNCTION fn_update_report_agent_call_receipt_target() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.agent_slug = 'report-judgement'
      AND num_nonnulls(NEW.post_id, NEW.reported_user_id, NEW.hostname_id, NEW.rss_feed_item_id) <> 1 THEN
      RAISE EXCEPTION 'Report call receipts require exactly one live target';
    END IF;
    IF NEW.agent_slug = 'story-post' AND NEW.post_id IS NULL THEN
      RAISE EXCEPTION 'Story post call receipts require a live post';
    END IF;
  ELSIF OLD.result_ciphertext = 'erased'
    OR (OLD.agent_slug = 'report-judgement'
      AND num_nonnulls(OLD.post_id, OLD.reported_user_id, OLD.hostname_id, OLD.rss_feed_item_id) = 1
      AND num_nonnulls(NEW.post_id, NEW.reported_user_id, NEW.hostname_id, NEW.rss_feed_item_id) = 0)
    OR (OLD.agent_slug = 'story-post' AND OLD.post_id IS NOT NULL AND NEW.post_id IS NULL) THEN
    NEW.result_ciphertext := 'erased';
  END IF;
  RETURN NEW;
END;
$$;
COMMENT ON FUNCTION fn_update_report_agent_call_receipt_target() IS 'Requires a live report target or story post on insert and irreversibly tombstones a receipt when that subject is hard-deleted.';
CREATE TRIGGER trigger_erase_report_agent_call_receipt_target
  BEFORE INSERT OR UPDATE ON ai_agent_call_receipts
  FOR EACH ROW EXECUTE FUNCTION fn_update_report_agent_call_receipt_target();

COMMENT ON TABLE ai_agent_call_receipts IS 'Pre-dispatch receipts for paid agent decisions. A null result is an ambiguous in-flight attempt and never authorizes an automatic provider retry.';
COMMENT ON COLUMN ai_agent_call_receipts.id IS 'UUIDv7 receipt identity and creation order.';
COMMENT ON COLUMN ai_agent_call_receipts.operation_key IS 'SHA-256 of the agent and stable logical operation identity; retries cannot mint a second paid call by changing the request.';
COMMENT ON COLUMN ai_agent_call_receipts.agent_slug IS 'Agent that reserved the paid call.';
COMMENT ON COLUMN ai_agent_call_receipts.request_sha256 IS 'SHA-256 of the selected model, prompt/schema contract version and exact provider input reserved for this operation; mismatched retries require review.';
COMMENT ON COLUMN ai_agent_call_receipts.copyright_notice_submission_id IS 'Retention owner for copyright guidance and appeal results; null for other agents.';
COMMENT ON COLUMN ai_agent_call_receipts.result_ciphertext IS 'Encrypted provider result saved before the agent writes its domain result; re-used after a downstream failure.';
COMMENT ON COLUMN ai_agent_call_receipts.created_at IS 'Creation time derived from the UUIDv7 receipt identity.';
COMMENT ON COLUMN ai_agent_call_receipts.post_id IS 'Story post being written, or a reported post or comment. Hard deletion erases the result while retaining the paid operation key.';
COMMENT ON COLUMN ai_agent_call_receipts.reported_user_id IS 'Reported user; hard deletion erases the result while retaining the paid operation key.';
COMMENT ON COLUMN ai_agent_call_receipts.hostname_id IS 'Reported URL hostname; hard deletion erases the result while retaining the paid operation key.';
COMMENT ON COLUMN ai_agent_call_receipts.rss_feed_item_id IS 'Reported RSS feed item; hard deletion erases the result while retaining the paid operation key.';
