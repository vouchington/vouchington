-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
-- Reserve the logical decision before a paid provider request. An interrupted request may have
-- been billed, so its empty result must be reviewed rather than dispatched again.
CREATE TABLE IF NOT EXISTS ai_agent_call_receipts (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  operation_key TEXT NOT NULL UNIQUE,
  agent_slug TEXT NOT NULL,
  request_sha256 TEXT NOT NULL,
  copyright_notice_submission_id UUID,
  result_ciphertext TEXT,
  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  CHECK (char_length(operation_key) = 64),
  CHECK (char_length(request_sha256) = 64),
  CHECK ((agent_slug IN ('copyright-submission-guidance', 'copyright-appeal-recommendation'))
    = (copyright_notice_submission_id IS NOT NULL)),
  CHECK (result_ciphertext IS NULL OR char_length(result_ciphertext) > 0)
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

COMMENT ON TABLE ai_agent_call_receipts IS 'Pre-dispatch receipts for paid agent decisions. A null result is an ambiguous in-flight attempt and never authorizes an automatic provider retry.';
COMMENT ON COLUMN ai_agent_call_receipts.id IS 'UUIDv7 receipt identity and creation order.';
COMMENT ON COLUMN ai_agent_call_receipts.operation_key IS 'SHA-256 of the agent and stable logical operation identity; retries cannot mint a second paid call by changing the request.';
COMMENT ON COLUMN ai_agent_call_receipts.agent_slug IS 'Agent that reserved the paid call.';
COMMENT ON COLUMN ai_agent_call_receipts.request_sha256 IS 'SHA-256 of the selected model, prompt/schema contract version and exact provider input reserved for this operation; mismatched retries require review.';
COMMENT ON COLUMN ai_agent_call_receipts.copyright_notice_submission_id IS 'Retention owner for copyright guidance and appeal results; null for other agents.';
COMMENT ON COLUMN ai_agent_call_receipts.result_ciphertext IS 'Encrypted provider result saved before the agent writes its domain result; re-used after a downstream failure.';
COMMENT ON COLUMN ai_agent_call_receipts.created_at IS 'Creation time derived from the UUIDv7 receipt identity.';
