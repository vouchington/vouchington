-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
-- Reserve the logical decision before a paid provider request. An interrupted request may have
-- been billed, so its empty result must be reviewed rather than dispatched again.
CREATE TABLE IF NOT EXISTS ai_agent_call_receipts (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  operation_key TEXT NOT NULL UNIQUE,
  agent_slug TEXT NOT NULL,
  result_ciphertext TEXT,
  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  CHECK (char_length(operation_key) = 64),
  CHECK (result_ciphertext IS NULL OR char_length(result_ciphertext) > 0)
);

COMMENT ON TABLE ai_agent_call_receipts IS 'Pre-dispatch receipts for paid agent decisions. A null result is an ambiguous in-flight attempt and never authorizes an automatic provider retry.';
COMMENT ON COLUMN ai_agent_call_receipts.id IS 'UUIDv7 receipt identity and creation order.';
COMMENT ON COLUMN ai_agent_call_receipts.operation_key IS 'SHA-256 of the logical operation, selected model, and exact provider input.';
COMMENT ON COLUMN ai_agent_call_receipts.agent_slug IS 'Agent that reserved the paid call.';
COMMENT ON COLUMN ai_agent_call_receipts.result_ciphertext IS 'Encrypted provider result saved before the agent writes its domain result; re-used after a downstream failure.';
COMMENT ON COLUMN ai_agent_call_receipts.created_at IS 'Creation time derived from the UUIDv7 receipt identity.';
