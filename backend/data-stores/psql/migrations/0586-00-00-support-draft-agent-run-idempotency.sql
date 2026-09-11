ALTER TABLE support_messages
ADD COLUMN IF NOT EXISTS agent_run_id UUID;

ALTER TABLE support_messages
ADD CONSTRAINT fk_support_messages__agent_run
FOREIGN KEY (agent_run_id) REFERENCES support_agent_runs (id) ON DELETE SET NULL
NOT VALID;

ALTER TABLE support_messages
VALIDATE CONSTRAINT fk_support_messages__agent_run;

CREATE UNIQUE INDEX IF NOT EXISTS idx_support_messages__agent_run
ON support_messages (agent_run_id)
WHERE agent_run_id IS NOT NULL;

COMMENT ON COLUMN support_messages.agent_run_id IS 'Optional durable agent-run identity used to make keyed draft creation idempotent.';
