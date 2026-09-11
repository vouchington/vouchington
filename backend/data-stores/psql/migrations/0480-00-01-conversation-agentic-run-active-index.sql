CREATE INDEX IF NOT EXISTS idx_conversation_message_agentic_runs__active_conversation
ON conversation_message_agentic_runs (conversation_id)
WHERE completed_at IS NULL
  AND failed_at IS NULL
  AND deleted_at IS NULL;
