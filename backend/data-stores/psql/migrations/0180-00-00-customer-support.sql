-- Coalesced pre-launch domain baseline.
-- edited-in-place: pre-launch, never deployed to production
-- edited-in-place: swapped 'english' to 'voucha_english' text search config (unaccent support)
-- Merged from: 0310-00-00-customer-support.sql, 0420-00-00-support-inbound-email-message-ids.sql

-- ==========================================================================
-- 0310-00-00-customer-support.sql
-- ============================================================================

-- support_contacts is defined in 0095-00-00-support-contacts.sql (before conversations)

-- Support threads: one thread per support conversation
CREATE TABLE IF NOT EXISTS support_threads (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  support_contact_id UUID NOT NULL REFERENCES support_contacts ON DELETE CASCADE,
  subject TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  -- Link to a shared user conversation (optional — set when user explicitly shares their chat)
  conversation_id UUID REFERENCES conversations ON DELETE SET NULL,

  -- lifecycle FK (added in 0290)
  latest_lifecycle_change_id UUID,

  -- Lifecycle timestamps (no status column — derived from these)
  -- Status: open = assigned_at IS NULL AND resolved_at IS NULL
  --         assigned = assigned_at IS NOT NULL AND resolved_at IS NULL
  --         resolved = resolved_at IS NOT NULL
  assigned_at TIMESTAMPTZ,
  assigned_to_id UUID REFERENCES users ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ,
  resolved_by_id UUID REFERENCES users ON DELETE SET NULL,

  CONSTRAINT chk_support_threads__assigned
    CHECK (
      (assigned_at IS NULL AND assigned_to_id IS NULL) OR
      (assigned_at IS NOT NULL AND assigned_to_id IS NOT NULL)
    ),
  CONSTRAINT chk_support_threads__resolved
    CHECK (
      (resolved_at IS NULL AND resolved_by_id IS NULL) OR
      (resolved_at IS NOT NULL AND resolved_by_id IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS idx_support_threads__support_contact_id
  ON support_threads (support_contact_id, id DESC);

CREATE INDEX IF NOT EXISTS idx_support_threads__assigned_to_id
  ON support_threads (assigned_to_id) WHERE assigned_to_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_support_threads__conversation_id
  ON support_threads (conversation_id) WHERE conversation_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_support_threads__unresolved
  ON support_threads (id DESC) WHERE resolved_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_support_threads__subject_trgm
  ON support_threads USING GIN (subject gin_trgm_ops);

CREATE TRIGGER trigger_support_threads_updated_at
  BEFORE UPDATE ON support_threads
  FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();

COMMENT ON TABLE support_threads IS 'Customer support conversation threads. One thread per topic.';
COMMENT ON COLUMN support_threads.support_contact_id IS 'The contact who opened this thread.';
COMMENT ON COLUMN support_threads.subject IS 'Summary subject line for the thread.';
COMMENT ON COLUMN support_threads.conversation_id IS 'Optional: linked user chat conversation shared by the user for support context. Admins may read this conversation.';
COMMENT ON COLUMN support_threads.assigned_at IS 'When set, the thread is assigned to assigned_to_id for handling.';
COMMENT ON COLUMN support_threads.assigned_to_id IS 'The support agent assigned to this thread.';
COMMENT ON COLUMN support_threads.resolved_at IS 'When set, the thread is resolved. derived status = resolved.';
COMMENT ON COLUMN support_threads.resolved_by_id IS 'The user who marked this thread as resolved.';
COMMENT ON COLUMN support_threads.latest_lifecycle_change_id IS 'Latest append-only lifecycle transition for this support thread.';

-- Support message directions
DO $$ BEGIN
  CREATE TYPE support_message_directions AS ENUM ('inbound', 'outbound');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Support messages: individual messages within a thread
CREATE TABLE IF NOT EXISTS support_messages (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  support_thread_id UUID NOT NULL REFERENCES support_threads ON DELETE CASCADE,
  CONSTRAINT uq_support_messages__thread_id UNIQUE (support_thread_id, id),

  direction support_message_directions NOT NULL,
  body_text TEXT NOT NULL DEFAULT '',
  body_html TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  created_by_id UUID REFERENCES users ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  -- Email metadata (populated for email-originated messages)
  email_message_id TEXT,
  email_subject TEXT,
  email_from TEXT,
  email_to TEXT,

  -- AI draft lifecycle timestamps (no status column — derived from these)
  -- draft = drafted_at IS NOT NULL AND sent_at IS NULL
  -- sent  = sent_at IS NOT NULL
  drafted_at TIMESTAMPTZ,
  edited_at TIMESTAMPTZ,
  edited_by_id UUID REFERENCES users ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  approved_by_id UUID REFERENCES users ON DELETE SET NULL,
  sent_at TIMESTAMPTZ,

  -- lifecycle FK (added in 0290)
  latest_lifecycle_change_id UUID,

  -- RAG search
  search_vector TSVECTOR GENERATED ALWAYS AS (
    to_tsvector('voucha_english', COALESCE(body_text, ''))
  ) STORED,
  bedrock_nova_multimodal_v1_embedding VECTOR(1024),
  bedrock_nova_multimodal_v1_content_sha256 BYTEA,
  bedrock_nova_multimodal_v1_input_sha256 BYTEA,
  bedrock_nova_multimodal_v1_embedding_created_at TIMESTAMPTZ,
  bedrock_nova_multimodal_v1_input_token_count INT,
  CHECK (bedrock_nova_multimodal_v1_input_token_count IS NULL OR bedrock_nova_multimodal_v1_input_token_count >= 0),
  CONSTRAINT chk_support_messages__body_not_empty
    CHECK (
      trim(COALESCE(body_text, '')) <> '' OR
      trim(COALESCE(body_html, '')) <> ''
    ),

  CONSTRAINT chk_support_messages__edited
    CHECK (
      (edited_at IS NULL AND edited_by_id IS NULL) OR
      (edited_at IS NOT NULL AND edited_by_id IS NOT NULL)
    ),
  CONSTRAINT chk_support_messages__approved
    CHECK (
      (approved_at IS NULL AND approved_by_id IS NULL) OR
      (approved_at IS NOT NULL AND approved_by_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_support_messages__search_vector
  ON support_messages USING GIN (search_vector);

CREATE INDEX IF NOT EXISTS idx_support_messages__embedding
  ON support_messages USING hnsw (bedrock_nova_multimodal_v1_embedding vector_cosine_ops)
  WHERE bedrock_nova_multimodal_v1_embedding IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_support_messages__email_message_id
  ON support_messages (email_message_id) WHERE email_message_id IS NOT NULL;

CREATE TRIGGER trigger_support_messages_updated_at
  BEFORE UPDATE ON support_messages
  FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();

COMMENT ON TABLE support_messages IS 'Individual inbound/outbound messages within a support thread. Retained indefinitely.';
COMMENT ON COLUMN support_messages.support_thread_id IS 'The thread this message belongs to.';
COMMENT ON COLUMN support_messages.direction IS 'inbound = from customer, outbound = from support team.';
COMMENT ON COLUMN support_messages.body_text IS 'Plain text content of the message.';
COMMENT ON COLUMN support_messages.body_html IS 'HTML content of the message.';
COMMENT ON COLUMN support_messages.drafted_at IS 'Set when message was AI-generated as a draft. NULL until admin approves and sends.';
COMMENT ON COLUMN support_messages.edited_at IS 'When the draft was last edited by a human.';
COMMENT ON COLUMN support_messages.edited_by_id IS 'The user who last edited the draft.';
COMMENT ON COLUMN support_messages.approved_at IS 'Set when an admin approves the draft for sending.';
COMMENT ON COLUMN support_messages.approved_by_id IS 'The admin who approved the draft.';
COMMENT ON COLUMN support_messages.sent_at IS 'Set when the message is actually sent to the customer.';
COMMENT ON COLUMN support_messages.email_message_id IS 'Email Message-ID header for threading inbound replies.';
COMMENT ON COLUMN support_messages.email_subject IS 'Subject line from the inbound email.';
COMMENT ON COLUMN support_messages.email_from IS 'Sender address from the inbound email.';
COMMENT ON COLUMN support_messages.email_to IS 'Recipient address from the inbound email.';
COMMENT ON COLUMN support_messages.search_vector IS 'Full-text search vector for RAG queries.';
COMMENT ON COLUMN support_messages.latest_lifecycle_change_id IS 'Latest append-only lifecycle transition for this support message.';

-- Support agent runs: tracks AI agent runs for response generation
CREATE TABLE IF NOT EXISTS support_agent_runs (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  support_thread_id UUID NOT NULL REFERENCES support_threads ON DELETE CASCADE,
  support_message_id UUID NOT NULL,
  FOREIGN KEY (support_thread_id, support_message_id)
    REFERENCES support_messages (support_thread_id, id) ON DELETE CASCADE,

  model_name agent_models NOT NULL,
  model_provider agent_model_providers NOT NULL,
  input JSONB NOT NULL,
  output JSONB,
  error JSONB,
  failed_at TIMESTAMPTZ,
  termination_reason conversation_message_agentic_runs_termination_reasons,
  started_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMPTZ,
  CHECK (completed_at IS NULL OR failed_at IS NULL),

  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER trigger_support_agent_runs_updated_at
  BEFORE UPDATE ON support_agent_runs
  FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();

CREATE INDEX IF NOT EXISTS idx_support_agent_runs__thread_message
  ON support_agent_runs (support_thread_id, support_message_id);

COMMENT ON TABLE support_agent_runs IS 'AI agent runs for generating support response drafts. Retained indefinitely.';
COMMENT ON COLUMN support_agent_runs.support_thread_id IS 'The thread this agent run is responding to.';
COMMENT ON COLUMN support_agent_runs.support_message_id IS 'The inbound message that triggered this agent run.';
COMMENT ON COLUMN support_agent_runs.model_name IS 'LLM model used for this agent run.';
COMMENT ON COLUMN support_agent_runs.model_provider IS 'LLM provider used for this agent run.';
COMMENT ON COLUMN support_agent_runs.input IS 'Thread context passed to the agent.';
COMMENT ON COLUMN support_agent_runs.output IS 'Generated draft text.';
COMMENT ON COLUMN support_agent_runs.error IS 'Error details if the run failed.';
COMMENT ON COLUMN support_agent_runs.failed_at IS 'When the agent run failed. Derived status is failed when set.';
COMMENT ON COLUMN support_agent_runs.termination_reason IS 'Why the agent run ended.';
COMMENT ON COLUMN support_agent_runs.started_at IS 'When the agent run began processing.';
COMMENT ON COLUMN support_agent_runs.completed_at IS 'When the agent run completed successfully.';

-- ==========================================================================
-- 0420-00-00-support-inbound-email-message-ids.sql
-- ============================================================================

CREATE TABLE IF NOT EXISTS support_inbound_email_message_ids (
  email_message_id TEXT PRIMARY KEY,
  support_thread_id UUID,
  support_message_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMPTZ,

  CONSTRAINT chk_support_inbound_email_message_ids__completed
    CHECK (
      (support_thread_id IS NULL AND support_message_id IS NULL AND completed_at IS NULL) OR
      (support_thread_id IS NOT NULL AND support_message_id IS NOT NULL AND completed_at IS NOT NULL)
    ),
  FOREIGN KEY (support_thread_id, support_message_id)
    REFERENCES support_messages (support_thread_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_support_inbound_email_message_ids__message
  ON support_inbound_email_message_ids (support_thread_id, support_message_id)
  WHERE support_message_id IS NOT NULL;

CREATE TRIGGER trigger_support_inbound_email_message_ids_updated_at
  BEFORE UPDATE ON support_inbound_email_message_ids
  FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();

COMMENT ON TABLE support_inbound_email_message_ids IS 'Unpartitioned registry for globally unique inbound support email Message-ID values.';
COMMENT ON COLUMN support_inbound_email_message_ids.email_message_id IS 'Trimmed inbound email Message-ID header value, globally unique across support message partitions.';
COMMENT ON COLUMN support_inbound_email_message_ids.support_thread_id IS 'Support thread containing the inbound message once reservation is completed.';
COMMENT ON COLUMN support_inbound_email_message_ids.support_message_id IS 'Support message row containing this inbound email once reservation is completed.';
COMMENT ON COLUMN support_inbound_email_message_ids.completed_at IS 'When the reservation was linked to a persisted support message.';
