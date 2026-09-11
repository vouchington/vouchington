-- edited-in-place: pre-launch, never deployed to production
-- Agent responses: standalone agent task results with SSE streaming and pub/sub.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'agent_name') THEN
    CREATE TYPE agent_name AS ENUM ('research');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'agent_response_termination_reason') THEN
    CREATE TYPE agent_response_termination_reason AS ENUM (
      'no_tool_calls',
      'max_iterations',
      'stalled',
      'error'
    );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS agent_responses (
  id                    UUID NOT NULL DEFAULT uuidv7(),
  -- guardrails-disable-next-line uuid-must-be-key
  created_by_id         UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  agent                 agent_name NOT NULL,
  model_name            agent_models,
  model_provider        agent_model_providers,
  job_id                TEXT,
  input                 JSONB NOT NULL DEFAULT '{}',
  output                JSONB,
  error                 JSONB,
  termination_reason    agent_response_termination_reason,
  started_at            TIMESTAMPTZ,
  completed_at          TIMESTAMPTZ,
  failed_at             TIMESTAMPTZ,
  deleted_at            TIMESTAMPTZ,
  created_at            TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_agent_responses__one_terminal_state
    CHECK (completed_at IS NULL OR failed_at IS NULL),
  PRIMARY KEY (id)
) PARTITION BY RANGE (id);

CREATE OR REPLACE TRIGGER trigger_agent_responses_updated_at
  BEFORE UPDATE ON agent_responses
  FOR EACH ROW
  EXECUTE FUNCTION fn_update_updated_at();

CREATE OR REPLACE TRIGGER trigger_agent_responses_guard_terminal_lifecycle
  BEFORE UPDATE ON agent_responses
  FOR EACH ROW
  EXECUTE FUNCTION fn_guard_terminal_lifecycle('completed_at', 'failed_at');

CREATE INDEX IF NOT EXISTS agent_responses_created_by_id_id_idx
  ON agent_responses (created_by_id, id DESC);

-- Partial index for counting running responses (for concurrency guard)
CREATE INDEX IF NOT EXISTS agent_responses_running_idx
  ON agent_responses (created_by_id)
  WHERE deleted_at IS NULL
    AND completed_at IS NULL
    AND failed_at IS NULL;

COMMENT ON TABLE agent_responses IS 'Standalone agent task runs with SSE streaming support and quota enforcement.';
COMMENT ON COLUMN agent_responses.updated_at IS 'Automatically updated on each row change.';
COMMENT ON COLUMN agent_responses.id IS 'UUIDv7 primary key, used for time-range partitioning.';
COMMENT ON COLUMN agent_responses.created_by_id IS 'The user who requested the agent response.';
COMMENT ON COLUMN agent_responses.agent IS 'Which agent handled this response (e.g. research).';
COMMENT ON COLUMN agent_responses.model_name IS 'LLM model used; NULL until the worker starts.';
COMMENT ON COLUMN agent_responses.model_provider IS 'LLM provider; NULL until the worker starts.';
COMMENT ON COLUMN agent_responses.job_id IS 'glide-mq job ID; NULL until enqueued.';
COMMENT ON COLUMN agent_responses.input IS 'Structured input payload (task, context).';
COMMENT ON COLUMN agent_responses.output IS 'Final structured output (content); NULL until completed.';
COMMENT ON COLUMN agent_responses.error IS 'Error details; NULL unless failed.';
COMMENT ON COLUMN agent_responses.termination_reason IS 'How the run ended.';
COMMENT ON COLUMN agent_responses.started_at IS 'When the worker began executing; NULL until started.';
COMMENT ON COLUMN agent_responses.completed_at IS 'When the run completed successfully.';
COMMENT ON COLUMN agent_responses.failed_at IS 'When the run failed.';
COMMENT ON COLUMN agent_responses.deleted_at IS 'Soft-delete / cancellation timestamp.';
