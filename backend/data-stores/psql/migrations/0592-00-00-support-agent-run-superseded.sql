ALTER TYPE conversation_message_agentic_runs_termination_reasons
ADD VALUE IF NOT EXISTS 'superseded';

COMMENT ON COLUMN support_agent_runs.termination_reason IS 'Why the run ended. Superseded runs are terminal and cannot be reclaimed.';
