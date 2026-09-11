-- edited-in-place: pre-launch, never deployed to production
ALTER TABLE support_agent_runs
ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

ALTER TABLE support_agent_runs
ADD COLUMN IF NOT EXISTS claim_token TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_support_agent_runs__idempotency_key
ON support_agent_runs (idempotency_key)
WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_support_agent_runs__pending_member_intent
ON support_agent_runs (support_message_id)
INCLUDE (support_thread_id, idempotency_key)
WHERE idempotency_key =
  'support_member_thread__' || support_message_id::TEXT || '__customer_support'
  AND completed_at IS NULL;

COMMENT ON COLUMN support_agent_runs.idempotency_key IS 'Optional durable logical intent that prevents a replayed queue job from creating a second agent run or draft.';
COMMENT ON COLUMN support_agent_runs.claim_token IS 'Opaque fencing token rotated by every winning keyed claim; stale claimants cannot mutate a newer attempt.';
