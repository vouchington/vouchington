-- Retire the local customer-support system after traffic moves to support@voucha.ai.
-- Generic conversations and copyright email intake remain.

DELETE FROM conversation_messages
USING conversations
WHERE conversation_messages.conversation_id = conversations.id
  AND conversations.channel_type = 'customer_support';

DELETE FROM conversation_participants
USING conversations
WHERE conversation_participants.conversation_id = conversations.id
  AND conversations.channel_type = 'customer_support';

DELETE FROM conversations
WHERE channel_type = 'customer_support';

-- Preserve non-support conversation content while retiring the support-contact identity.
UPDATE conversation_messages
SET support_contact_id = NULL
WHERE support_contact_id IS NOT NULL;

DELETE FROM conversation_participants
WHERE support_contact_id IS NOT NULL;

-- Revoke the retired role and account without cascading through authored records.
DELETE FROM user_roles_types
WHERE slug = 'customer_support';

UPDATE users
SET deleted_at = CURRENT_TIMESTAMP
WHERE username = 'customer-support'
  AND is_system
  AND deleted_at IS NULL;

DROP INDEX IF EXISTS idx_conv_messages__support_contact_id;

ALTER TABLE conversation_messages
  DROP CONSTRAINT IF EXISTS chk_conversation_messages__sender,
  -- squawk-ignore ban-drop-column -- Local support contacts are retired in this release.
  DROP COLUMN support_contact_id;

COMMENT ON COLUMN conversation_messages.created_by_id IS
  'The registered user who sent this message. NULL when the sender is unavailable.';

DROP INDEX IF EXISTS idx_conv_participants__conversation_contact;
DROP INDEX IF EXISTS idx_conv_participants__support_contact_id;

ALTER TABLE conversation_participants
  DROP CONSTRAINT IF EXISTS chk_conversation_participants__identity,
  -- squawk-ignore ban-drop-column -- Local support contacts are retired in this release.
  DROP COLUMN support_contact_id,
  ADD CONSTRAINT chk_conversation_participants__identity CHECK (user_id IS NOT NULL) NOT VALID;

ALTER TABLE conversation_participants
  VALIDATE CONSTRAINT chk_conversation_participants__identity;

COMMENT ON TABLE conversation_participants IS
  'Registered-user participants in a conversation. Enables multi-party threads.';
COMMENT ON COLUMN conversation_participants.user_id IS
  'Registered user participant.';

ALTER TABLE conversations
  ALTER COLUMN channel_type DROP DEFAULT,
  DROP CONSTRAINT IF EXISTS chk_conversations__modmail_columns;

DROP INDEX IF EXISTS idx_conversations__direct_message_updated;
DROP INDEX IF EXISTS idx_conversations__modmail_community_updated;
DROP INDEX IF EXISTS idx_conversations__modmail_subject_updated;
DROP INDEX IF EXISTS uq_conversations__modmail_open_per_subject;
DROP INDEX IF EXISTS uq_conversations__mod_internal_open_report;
DROP INDEX IF EXISTS uq_conversations__mod_internal_open_post;

CREATE TYPE conversation_channel_types__without_customer_support AS ENUM (
  'chat', 'direct_message', 'modmail', 'mod_internal'
);

ALTER TABLE conversations
  -- squawk-ignore changing-column-type -- Customer-support conversations are deleted above.
  ALTER COLUMN channel_type TYPE conversation_channel_types__without_customer_support
  USING channel_type::text::conversation_channel_types__without_customer_support;

DROP TYPE conversation_channel_types;
ALTER TYPE conversation_channel_types__without_customer_support RENAME TO conversation_channel_types;

ALTER TABLE conversations
  ALTER COLUMN channel_type SET DEFAULT 'chat',
  ADD CONSTRAINT chk_conversations__modmail_columns CHECK (
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
  ) NOT VALID;

ALTER TABLE conversations
  VALIDATE CONSTRAINT chk_conversations__modmail_columns;

CREATE INDEX idx_conversations__direct_message_updated
  ON conversations (updated_at DESC, id DESC)
  WHERE channel_type = 'direct_message' AND deleted_at IS NULL;
CREATE INDEX idx_conversations__modmail_community_updated
  ON conversations (community_id, updated_at DESC, id DESC)
  WHERE channel_type = 'modmail' AND deleted_at IS NULL;
CREATE INDEX idx_conversations__modmail_subject_updated
  ON conversations (subject_user_id, updated_at DESC, id DESC)
  WHERE channel_type = 'modmail' AND subject_user_id IS NOT NULL AND deleted_at IS NULL;
CREATE UNIQUE INDEX uq_conversations__modmail_open_per_subject
  ON conversations (community_id, subject_user_id)
  WHERE channel_type = 'modmail' AND resolved_at IS NULL AND deleted_at IS NULL;
CREATE UNIQUE INDEX uq_conversations__mod_internal_open_report
  ON conversations (moderation_report_id)
  WHERE channel_type = 'mod_internal' AND moderation_report_id IS NOT NULL
    AND resolved_at IS NULL AND deleted_at IS NULL;
CREATE UNIQUE INDEX uq_conversations__mod_internal_open_post
  ON conversations (post_id)
  WHERE channel_type = 'mod_internal' AND post_id IS NOT NULL
    AND resolved_at IS NULL AND deleted_at IS NULL;

COMMENT ON TABLE conversations IS
  'Threaded conversations that can be associated with a post or RSS feed item.';
COMMENT ON COLUMN conversations.channel_type IS
  'Conversation channel: chat for user and agent chat, direct_message, modmail, or mod_internal.';

-- squawk-ignore ban-drop-table -- Local customer-support data is retired in this release.
DROP TABLE support_inbound_email_receipts;
-- squawk-ignore ban-drop-table -- Local customer-support data is retired in this release.
DROP TABLE support_inbound_email_message_ids;
ALTER TABLE support_messages
  DROP CONSTRAINT IF EXISTS fk_support_messages__agent_run,
  DROP CONSTRAINT IF EXISTS fk_support_messages_latest_lifecycle_change_id;
ALTER TABLE support_threads
  DROP CONSTRAINT IF EXISTS fk_support_threads_latest_lifecycle_change_id;
-- squawk-ignore ban-drop-table -- Local customer-support data is retired in this release.
DROP TABLE support_agent_runs;
-- squawk-ignore ban-drop-table -- Local customer-support data is retired in this release.
DROP TABLE support_message_lifecycle_changes;
-- squawk-ignore ban-drop-table -- Local customer-support data is retired in this release.
DROP TABLE support_messages;
-- squawk-ignore ban-drop-table -- Local customer-support data is retired in this release.
DROP TABLE support_thread_lifecycle_changes;
-- squawk-ignore ban-drop-table -- Local customer-support data is retired in this release.
DROP TABLE support_threads;
-- squawk-ignore ban-drop-table -- Local customer-support data is retired in this release.
DROP TABLE support_contacts;

DROP TYPE support_message_directions;
DROP TYPE support_message_lifecycle_change_types;
DROP TYPE support_thread_lifecycle_change_types;
