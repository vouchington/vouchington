-- Coalesced pre-launch domain baseline.
-- edited-in-place: pre-launch, never deployed to production
-- Merged from: 0100-00-00-conversations.sql, 0320-00-00-agentic-run-parent-id.sql

-- ==========================================================================
-- 0100-00-00-conversations.sql
-- ============================================================================

DO $$ BEGIN
  CREATE TYPE conversation_channel_types AS ENUM ('chat', 'direct_message', 'modmail', 'mod_internal');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE conversation_message_kinds AS ENUM ('chat', 'email', 'note', 'message');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE conversation_message_directions AS ENUM ('inbound', 'outbound');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE conversation_participant_add_policies AS ENUM ('owner_only', 'all_members');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  channel_type conversation_channel_types NOT NULL DEFAULT 'chat',
  title TEXT NOT NULL DEFAULT '',
  last_response_id TEXT,
  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  created_by_id UUID REFERENCES users ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_by_id UUID REFERENCES users ON DELETE SET NULL,
  deleted_at TIMESTAMPTZ,
  deleted_by_id UUID REFERENCES users ON DELETE SET NULL,

  -- Explicit resolution lifecycle (open = NULL, resolved = set)
  resolved_at TIMESTAMPTZ,
  resolved_by_id UUID REFERENCES users ON DELETE SET NULL,
  -- resolved_by_id may be NULL if the resolver account was deleted (resolved_at is preserved)
  CONSTRAINT chk_conversations__resolved
    CHECK (resolved_by_id IS NULL OR resolved_at IS NOT NULL),

  -- Entity references for searching conversations by post or RSS feed item
  post_id UUID REFERENCES posts ON DELETE SET NULL,
  rss_feed_item_id UUID REFERENCES rss_feed_items ON DELETE SET NULL,
  -- Internal mod discussion thread entity reference.
  -- FK to moderation_reports added in 0331-00-00 (after moderation_reports is created in 0330-00-00).
  -- guardrails-disable-next-line uuid-must-be-key
  moderation_report_id UUID,

  -- Direct message / modmail entity references
  -- guardrails-disable-next-line uuid-must-be-key
  community_id UUID,  -- FK to communities added in 0140-00-00
  subject_user_id UUID REFERENCES users ON DELETE SET NULL,
  assigned_mod_id UUID REFERENCES users ON DELETE SET NULL,
  assigned_at TIMESTAMPTZ,
  -- Controls who can add participants to a direct_message conversation.
  -- Only applies to channel_type = 'direct_message'; ignored for other channel types.
  participant_add_policy conversation_participant_add_policies NOT NULL DEFAULT 'owner_only',
  -- subject_user_id is required when opening modmail but may become NULL if the user is
  -- hard-deleted (ON DELETE SET NULL); community_id remains required for all modmail.
  -- For mod_internal, community_id is required and exactly one of moderation_report_id/post_id is set.
  CONSTRAINT chk_conversations__modmail_columns
    CHECK (
      (channel_type = 'modmail'
        AND community_id IS NOT NULL
      ) OR
      (channel_type = 'mod_internal'
        AND community_id IS NOT NULL
        AND subject_user_id IS NULL
        AND assigned_mod_id IS NULL
        AND num_nonnulls(moderation_report_id, post_id) = 1
      ) OR
      (channel_type NOT IN ('modmail', 'mod_internal')
        AND community_id IS NULL
        AND subject_user_id IS NULL
        AND assigned_mod_id IS NULL
      )
    ),
  CONSTRAINT chk_conversations__assigned
    CHECK (assigned_mod_id IS NULL OR assigned_at IS NOT NULL)
);

CREATE TRIGGER trigger_conversations_updated_at
BEFORE UPDATE ON conversations
FOR EACH ROW
EXECUTE FUNCTION fn_update_updated_at();

CREATE INDEX IF NOT EXISTS idx_conversations__created_by_id__id_desc
ON conversations (created_by_id, id DESC)
WHERE created_by_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_conversations__post_id ON conversations (post_id) WHERE post_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_conversations__rss_feed_item_id ON conversations (rss_feed_item_id) WHERE rss_feed_item_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_conversations__community_id ON conversations (community_id, id DESC) WHERE community_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_conversations__direct_message_updated
  ON conversations (updated_at DESC, id DESC)
  WHERE channel_type = 'direct_message' AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_conversations__modmail_community_updated
  ON conversations (community_id, updated_at DESC, id DESC)
  WHERE channel_type = 'modmail' AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_conversations__modmail_subject_updated
  ON conversations (subject_user_id, updated_at DESC, id DESC)
  WHERE channel_type = 'modmail' AND subject_user_id IS NOT NULL AND deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_conversations__modmail_open_per_subject
  ON conversations (community_id, subject_user_id)
  WHERE channel_type = 'modmail' AND resolved_at IS NULL AND deleted_at IS NULL;
-- One open internal mod-discussion thread per report / per pending post-review.
CREATE UNIQUE INDEX IF NOT EXISTS uq_conversations__mod_internal_open_report
  ON conversations (moderation_report_id)
  WHERE channel_type = 'mod_internal' AND moderation_report_id IS NOT NULL
    AND resolved_at IS NULL AND deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_conversations__mod_internal_open_post
  ON conversations (post_id)
  WHERE channel_type = 'mod_internal' AND post_id IS NOT NULL
    AND resolved_at IS NULL AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_conversations__moderation_report_id
  ON conversations (moderation_report_id)
  WHERE moderation_report_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_conversations__assigned_mod_id ON conversations (assigned_mod_id) WHERE assigned_mod_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_conversations__unresolved
ON conversations (id DESC) WHERE resolved_at IS NULL;

COMMENT ON TABLE conversations IS 'Threaded conversations that can be associated with a post or RSS feed item.';
COMMENT ON COLUMN conversations.channel_type IS 'Conversation channel: chat for user and agent chat, direct_message, modmail, or mod_internal.';
COMMENT ON COLUMN conversations.title IS 'User-provided title for the conversation.';
COMMENT ON COLUMN conversations.last_response_id IS 'The last OpenAI response ID for this conversation, used to chain turns via previous_response_id.';
COMMENT ON COLUMN conversations.created_by_id IS 'The registered user who started the conversation. NULL if the creating user was hard-deleted (ON DELETE SET NULL).';
COMMENT ON COLUMN conversations.resolved_at IS 'When set, the conversation is resolved. Derived status: open = NULL, resolved = set.';
COMMENT ON COLUMN conversations.resolved_by_id IS 'The user who marked this conversation as resolved.';
COMMENT ON COLUMN conversations.post_id IS 'Optional post this conversation is about.';
COMMENT ON COLUMN conversations.rss_feed_item_id IS 'Optional RSS feed item this conversation is about.';
COMMENT ON COLUMN conversations.community_id IS 'The community this modmail thread belongs to. Required when channel_type is modmail.';
COMMENT ON COLUMN conversations.subject_user_id IS 'The user who is the subject of a modmail thread. Required when channel_type is modmail.';
COMMENT ON COLUMN conversations.assigned_mod_id IS 'The moderator currently assigned to handle a modmail thread. NULL means unassigned.';
COMMENT ON COLUMN conversations.assigned_at IS 'When this modmail thread was assigned to assigned_mod_id.';
COMMENT ON COLUMN conversations.moderation_report_id IS 'The moderation report this internal mod-discussion thread is about. Set when channel_type is mod_internal and the item is a report. Mutually exclusive with post_id for mod_internal threads.';
COMMENT ON COLUMN conversations.participant_add_policy IS 'Governs who may add participants to a direct_message conversation. owner_only (default): only the creator may add. all_members: any active participant may add.';

CREATE TABLE IF NOT EXISTS conversation_messages (
  id UUID NOT NULL DEFAULT uuidv7(),
  conversation_id UUID NOT NULL REFERENCES conversations ON DELETE CASCADE,
  PRIMARY KEY (conversation_id, id),

  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  -- ON DELETE SET NULL preserves a message after its author is deleted.
  created_by_id UUID REFERENCES users ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_by_id UUID REFERENCES users ON DELETE SET NULL,
  deleted_at TIMESTAMPTZ,
  deleted_by_id UUID REFERENCES users ON DELETE SET NULL,

  -- Chat messages use content JSONB; email messages use body_text/body_html
  kind conversation_message_kinds NOT NULL DEFAULT 'chat',
  direction conversation_message_directions,
  content JSONB,
  body_text TEXT,
  body_html TEXT,

  -- Email transport metadata (populated for email-channel messages)
  email_message_id TEXT,
  email_subject TEXT,
  email_from TEXT,
  email_to TEXT,
  delivered_at TIMESTAMPTZ,
  bounced_at TIMESTAMPTZ,
  received_at TIMESTAMPTZ,
  discarded_at TIMESTAMPTZ,
  ai_prompt TEXT,
  ai_generated_at TIMESTAMPTZ,

  -- AI draft lifecycle timestamps (no status column — derived from these)
  -- draft = drafted_at IS NOT NULL AND sent_at IS NULL
  -- sent  = sent_at IS NOT NULL
  drafted_at TIMESTAMPTZ,
  edited_at TIMESTAMPTZ,
  edited_by_id UUID REFERENCES users ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  approved_by_id UUID REFERENCES users ON DELETE SET NULL,
  sent_at TIMESTAMPTZ,
  CONSTRAINT chk_conversation_messages__edited
    CHECK (
      (edited_at IS NULL AND edited_by_id IS NULL) OR
      (edited_at IS NOT NULL AND edited_by_id IS NOT NULL)
    ),
  CONSTRAINT chk_conversation_messages__approved
    CHECK (
      (approved_at IS NULL AND approved_by_id IS NULL) OR
      (approved_at IS NOT NULL AND approved_by_id IS NOT NULL)
    ),
  CONSTRAINT chk_conversation_messages__kind_content
    CHECK (
      (kind = 'chat' AND content IS NOT NULL) OR
      (kind IN ('email', 'note') AND (body_text IS NOT NULL OR body_html IS NOT NULL)) OR
      (kind = 'message' AND body_text IS NOT NULL)
    ),
  CONSTRAINT chk_conversation_messages__direction
    CHECK (
      (kind = 'chat' AND direction IS NULL) OR
      (kind IN ('email', 'note') AND direction IS NOT NULL) OR
      (kind = 'message' AND direction IS NULL)
    ),
  CONSTRAINT chk_conversation_messages__discarded
    CHECK (sent_at IS NULL OR discarded_at IS NULL)
) PARTITION BY RANGE (conversation_id);

CREATE TRIGGER trigger_conversation_messages_updated_at
BEFORE UPDATE ON conversation_messages
FOR EACH ROW
EXECUTE FUNCTION fn_update_updated_at();

CREATE INDEX IF NOT EXISTS idx_conv_messages__created_by_id
ON conversation_messages (created_by_id)
WHERE created_by_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_conv_messages__email_message_id
ON conversation_messages (email_message_id)
WHERE email_message_id IS NOT NULL;

COMMENT ON TABLE conversation_messages IS 'Individual messages within a conversation, range-partitioned by conversation UUIDv7. Chat messages use content JSONB; email-channel messages use body_text/body_html.';
COMMENT ON COLUMN conversation_messages.conversation_id IS 'The conversation this message belongs to; also the partition key.';
COMMENT ON COLUMN conversation_messages.created_by_id IS 'The registered user who sent this message. NULL when the sender is unavailable.';
COMMENT ON COLUMN conversation_messages.kind IS 'Message kind: chat, email, or internal note.';
COMMENT ON COLUMN conversation_messages.direction IS 'Email/note direction. inbound = external contact, outbound = internal/admin authored.';
COMMENT ON COLUMN conversation_messages.content IS 'Message content stored as JSONB. Used for chat messages.';
COMMENT ON COLUMN conversation_messages.body_text IS 'Plain text message body. Used for email-channel messages.';
COMMENT ON COLUMN conversation_messages.body_html IS 'HTML message body. Used for email-channel messages.';
COMMENT ON COLUMN conversation_messages.email_message_id IS 'Email Message-ID header for threading inbound replies.';
COMMENT ON COLUMN conversation_messages.email_subject IS 'Subject line from the email.';
COMMENT ON COLUMN conversation_messages.email_from IS 'Sender address from the email.';
COMMENT ON COLUMN conversation_messages.email_to IS 'Recipient address from the email.';
COMMENT ON COLUMN conversation_messages.delivered_at IS 'When delivery was confirmed by the provider.';
COMMENT ON COLUMN conversation_messages.bounced_at IS 'When a bounce notification was received.';
COMMENT ON COLUMN conversation_messages.received_at IS 'When an inbound message was received.';
COMMENT ON COLUMN conversation_messages.discarded_at IS 'When a draft was discarded. Mutually exclusive with sent_at.';
COMMENT ON COLUMN conversation_messages.ai_prompt IS 'The prompt used to generate this message draft, if AI-assisted.';
COMMENT ON COLUMN conversation_messages.ai_generated_at IS 'When the AI draft was generated.';
COMMENT ON COLUMN conversation_messages.drafted_at IS 'Set when message was AI-generated as a draft. NULL until admin approves and sends.';
COMMENT ON COLUMN conversation_messages.edited_at IS 'When the draft was last edited by a human.';
COMMENT ON COLUMN conversation_messages.edited_by_id IS 'The user who last edited the draft.';
COMMENT ON COLUMN conversation_messages.approved_at IS 'Set when an admin approves the draft for sending.';
COMMENT ON COLUMN conversation_messages.approved_by_id IS 'The admin who approved the draft.';
COMMENT ON COLUMN conversation_messages.sent_at IS 'Set when the message is actually sent to the recipient.';

DO $$ BEGIN
  CREATE TYPE conversation_message_agentic_runs_termination_reasons AS ENUM (
    'no_tool_calls',
    'max_topics',
    'max_iterations',
    'stalled',
    'error',
    'superseded'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS conversation_message_agentic_runs (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  conversation_id UUID NOT NULL,
  conversation_message_id UUID NOT NULL,
  FOREIGN KEY (conversation_id, conversation_message_id)
    REFERENCES conversation_messages (conversation_id, id) ON DELETE CASCADE,

  -- NOTE: agent_id should match conversation_messages.created_by_id
  model_name TEXT NOT NULL,
  model_provider agent_model_providers NOT NULL,

  input JSONB NOT NULL, -- only include the _new_ input, exclude the previous
  output JSONB, -- the output of the agentic run, to be passed to the next message
  error JSONB, -- error information if the agentic run failed
  failed_at TIMESTAMPTZ,
  termination_reason conversation_message_agentic_runs_termination_reasons,
  started_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMPTZ,
  CHECK (completed_at IS NULL OR failed_at IS NULL),

  parent_agentic_run_id UUID REFERENCES conversation_message_agentic_runs (id) ON DELETE SET NULL,

  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMPTZ
  -- Debug-heavy data with partition-drop retention; range on id keeps monthly windows cheap to drop.
) PARTITION BY RANGE (id);

CREATE TRIGGER trigger_conversation_message_agentic_runs_updated_at
BEFORE UPDATE ON conversation_message_agentic_runs
FOR EACH ROW
EXECUTE FUNCTION fn_update_updated_at();

COMMENT ON TABLE conversation_message_agentic_runs IS 'Tracks individual agentic LLM runs triggered by a conversation message, range-partitioned by id for retention.';
COMMENT ON COLUMN conversation_message_agentic_runs.conversation_id IS 'The conversation containing the triggering message.';
COMMENT ON COLUMN conversation_message_agentic_runs.conversation_message_id IS 'The message that triggered this agentic run.';
COMMENT ON COLUMN conversation_message_agentic_runs.model_name IS 'The LLM model used for this run.';
COMMENT ON COLUMN conversation_message_agentic_runs.model_provider IS 'The provider of the LLM model (e.g. openai).';
COMMENT ON COLUMN conversation_message_agentic_runs.input IS 'New input for this run, excluding prior context.';
COMMENT ON COLUMN conversation_message_agentic_runs.output IS 'Output of the run, passed as context to subsequent messages.';
COMMENT ON COLUMN conversation_message_agentic_runs.error IS 'Error details if the run failed.';
COMMENT ON COLUMN conversation_message_agentic_runs.failed_at IS 'When the agentic run failed. Derived status is failed when set.';
COMMENT ON COLUMN conversation_message_agentic_runs.termination_reason IS 'Why the run ended (e.g. no_tool_calls, max_iterations, error).';
COMMENT ON COLUMN conversation_message_agentic_runs.started_at IS 'When the agentic run began executing.';
COMMENT ON COLUMN conversation_message_agentic_runs.completed_at IS 'When the agentic run completed successfully. Derived status is completed when set.';
COMMENT ON COLUMN conversation_message_agentic_runs.parent_agentic_run_id IS 'The orchestrator agentic run that spawned this subagent run. NULL for top-level runs.';

DO $$ BEGIN
  CREATE TYPE conversation_message_agentic_runs_events_types AS ENUM (
    'function_call',
    'model_response'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS conversation_message_agentic_runs_events (
  conversation_message_agentic_run_id UUID NOT NULL REFERENCES conversation_message_agentic_runs ON DELETE CASCADE,
  id UUID NOT NULL DEFAULT uuidv7(),
  PRIMARY KEY (conversation_message_agentic_run_id, id),
  type conversation_message_agentic_runs_events_types NOT NULL,
  input JSONB NOT NULL,
  output JSONB,

  -- assumption: updated_at is when the event was completed
  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMPTZ
  -- Partition by parent run's UUIDv7 id so event partitions age out with the run partitions they depend on.
) PARTITION BY RANGE (conversation_message_agentic_run_id);

CREATE TRIGGER trigger_conversation_message_agentic_runs_events_updated_at
BEFORE UPDATE ON conversation_message_agentic_runs_events
FOR EACH ROW
EXECUTE FUNCTION fn_update_updated_at();

CREATE INDEX IF NOT EXISTS idx_conversation_message_agentic_runs__conv_msg
ON conversation_message_agentic_runs (conversation_id, conversation_message_id);

CREATE INDEX IF NOT EXISTS idx_conversation_message_agentic_runs__conversation_message_id
ON conversation_message_agentic_runs (conversation_message_id, id DESC);

CREATE INDEX IF NOT EXISTS idx_conv_msg_agentic_runs__parent
ON conversation_message_agentic_runs (parent_agentic_run_id)
WHERE parent_agentic_run_id IS NOT NULL;

COMMENT ON TABLE conversation_message_agentic_runs_events IS 'Individual events (function calls, model responses) within an agentic run, partitioned by parent run ID.';
COMMENT ON COLUMN conversation_message_agentic_runs_events.conversation_message_agentic_run_id IS 'The agentic run this event belongs to; also the partition key.';
COMMENT ON COLUMN conversation_message_agentic_runs_events.type IS 'Event type: function_call or model_response.';
COMMENT ON COLUMN conversation_message_agentic_runs_events.input IS 'Input data for this event (e.g. function arguments or prompt).';
COMMENT ON COLUMN conversation_message_agentic_runs_events.output IS 'Output data from this event (e.g. function result or model response).';

CREATE INDEX IF NOT EXISTS idx_conv_msg_agentic_run_events__id
ON conversation_message_agentic_runs_events (id);

-- Participant roles for multi-party conversations
DO $$ BEGIN
  CREATE TYPE conversation_participant_roles AS ENUM ('owner', 'admin', 'member');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Participants in a conversation are registered users.
CREATE TABLE IF NOT EXISTS conversation_participants (
  conversation_id UUID NOT NULL REFERENCES conversations ON DELETE CASCADE,
  id UUID NOT NULL DEFAULT uuidv7(),
  PRIMARY KEY (conversation_id, id),

  user_id UUID NOT NULL REFERENCES users ON DELETE CASCADE,
  CONSTRAINT chk_conversation_participants__identity
    CHECK (user_id IS NOT NULL),

  role conversation_participant_roles NOT NULL,
  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  removed_at TIMESTAMPTZ,
  removed_by_id UUID REFERENCES users ON DELETE SET NULL,
  -- removed_by_id may be NULL when removed_at IS NOT NULL if the actor was hard-deleted
  CONSTRAINT chk_conversation_participants__removed
    CHECK (removed_at IS NOT NULL OR removed_by_id IS NULL),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER trigger_conversation_participants_updated_at
BEFORE UPDATE ON conversation_participants
FOR EACH ROW
EXECUTE FUNCTION fn_update_updated_at();

CREATE UNIQUE INDEX IF NOT EXISTS idx_conv_participants__conversation_user
ON conversation_participants (conversation_id, user_id)
WHERE user_id IS NOT NULL AND removed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_conv_participants__user_id
ON conversation_participants (user_id, conversation_id DESC)
WHERE user_id IS NOT NULL;

COMMENT ON TABLE conversation_participants IS 'Registered-user participants in a conversation. Enables multi-party threads.';
COMMENT ON COLUMN conversation_participants.conversation_id IS 'The conversation this participant belongs to.';
COMMENT ON COLUMN conversation_participants.user_id IS 'Registered user participant.';
COMMENT ON COLUMN conversation_participants.role IS 'owner = conversation initiator; admin = support staff.';
COMMENT ON COLUMN conversation_participants.removed_at IS 'When set, this participant has been removed from the conversation (soft-remove).';
COMMENT ON COLUMN conversation_participants.removed_by_id IS 'The user who removed this participant. NULL if removed_at is not set, or if the actor was hard-deleted.';
