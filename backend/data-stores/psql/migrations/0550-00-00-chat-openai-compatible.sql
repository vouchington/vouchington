-- edited-in-place: pre-launch, never deployed to production

ALTER TYPE agent_model_providers ADD VALUE IF NOT EXISTS 'openai_compatible';

ALTER TABLE conversation_message_agentic_runs
  -- squawk-ignore changing-column-type
  ALTER COLUMN model_name TYPE TEXT USING model_name::text;
