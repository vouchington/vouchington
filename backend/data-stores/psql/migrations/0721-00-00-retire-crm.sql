-- Retire the CRM data model after all CRM producers and consumers are removed.
-- Customer-support conversations and shared email/copyright infrastructure remain.

DELETE FROM admin_import_rows
USING admin_import_batches
WHERE admin_import_rows.batch_id = admin_import_batches.id
  AND admin_import_batches.import_type = 'crm_contact';

DELETE FROM admin_import_rows
WHERE crm_contact_id IS NOT NULL;

DELETE FROM admin_import_batches
WHERE import_type = 'crm_contact';

DELETE FROM conversation_messages
USING conversations
WHERE conversation_messages.conversation_id = conversations.id
  AND conversations.channel_type = 'crm';

DELETE FROM conversation_participants
USING conversations
WHERE conversation_participants.conversation_id = conversations.id
  AND conversations.channel_type = 'crm';

DELETE FROM conversations
WHERE channel_type = 'crm';

DELETE FROM conversation_participants
WHERE crm_contact_id IS NOT NULL;

ALTER TABLE crm_contacts
  DROP CONSTRAINT IF EXISTS fk_crm_contacts_latest_lifecycle_change_id;

DELETE FROM crm_contact_social_accounts;
DELETE FROM crm_contact_lifecycle_changes;
DELETE FROM crm_contacts;

DROP TRIGGER IF EXISTS trigger_admin_import_rows_validate_target ON admin_import_rows;
DROP FUNCTION IF EXISTS fn_validate_admin_import_row_target();
DROP INDEX IF EXISTS idx_admin_import_rows__crm_contact_id;

ALTER TABLE admin_import_rows
  DROP CONSTRAINT IF EXISTS chk_admin_import_rows__created_entity_lifecycle,
  -- squawk-ignore ban-drop-column -- CRM producers and consumers are removed in this release.
  DROP COLUMN crm_contact_id,
  ADD CONSTRAINT chk_admin_import_rows__created_entity_lifecycle CHECK (
    (completed_at IS NULL AND num_nonnulls(topic_id, rss_feed_id) = 0)
    OR (completed_at IS NOT NULL AND num_nonnulls(topic_id, rss_feed_id) = 1)
  ) NOT VALID;

ALTER TABLE admin_import_rows
  VALIDATE CONSTRAINT chk_admin_import_rows__created_entity_lifecycle;

CREATE OR REPLACE FUNCTION fn_validate_admin_import_row_target()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  batch_import_type admin_import_types;
BEGIN
  SELECT import_type
  INTO STRICT batch_import_type
  FROM admin_import_batches
  WHERE id = NEW.batch_id;

  IF NOT (
    (batch_import_type = 'topic' AND NEW.topic_id IS NOT NULL)
    OR (batch_import_type = 'rss_feed' AND NEW.rss_feed_id IS NOT NULL)
  ) THEN
    RAISE EXCEPTION 'admin import row target does not match batch import type %', batch_import_type
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_admin_import_rows_validate_target
  BEFORE INSERT OR UPDATE OF batch_id, completed_at, topic_id, rss_feed_id ON admin_import_rows
  FOR EACH ROW
  WHEN (NEW.completed_at IS NOT NULL)
  EXECUTE FUNCTION fn_validate_admin_import_row_target();

COMMENT ON COLUMN admin_import_batches.import_type IS
  'The type of entities being imported: topic or RSS feed.';

DROP TRIGGER IF EXISTS trigger_admin_import_batches_guard_import_type ON admin_import_batches;
DROP FUNCTION IF EXISTS fn_guard_admin_import_batch_type();

CREATE TYPE admin_import_types__without_crm AS ENUM ('topic', 'rss_feed');

ALTER TABLE admin_import_batches
  -- squawk-ignore changing-column-type -- The CRM enum value and all matching batches are deleted above.
  ALTER COLUMN import_type TYPE admin_import_types__without_crm
  USING import_type::text::admin_import_types__without_crm;

DROP TYPE admin_import_types;
ALTER TYPE admin_import_types__without_crm RENAME TO admin_import_types;

CREATE OR REPLACE FUNCTION fn_guard_admin_import_batch_type()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.import_type IS DISTINCT FROM NEW.import_type THEN
    RAISE EXCEPTION 'admin import batch type cannot change'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_admin_import_batches_guard_import_type
  BEFORE UPDATE OF import_type ON admin_import_batches
  FOR EACH ROW
  EXECUTE FUNCTION fn_guard_admin_import_batch_type();

DROP INDEX IF EXISTS idx_conv_messages__crm_contact_id;

ALTER TABLE conversation_messages
  DROP CONSTRAINT IF EXISTS chk_conversation_messages__sender,
  -- squawk-ignore ban-drop-column -- CRM producers and consumers are removed in this release.
  DROP COLUMN crm_contact_id,
  -- squawk-ignore ban-drop-column -- Only CRM messages used this provider marker.
  DROP COLUMN email_provider,
  ADD CONSTRAINT chk_conversation_messages__sender
    CHECK (num_nonnulls(created_by_id, support_contact_id) <= 1) NOT VALID;

ALTER TABLE conversation_messages
  VALIDATE CONSTRAINT chk_conversation_messages__sender;

COMMENT ON COLUMN conversation_messages.created_by_id IS
  'The registered user who sent this message. Mutually exclusive with support_contact_id.';
COMMENT ON COLUMN conversation_messages.support_contact_id IS
  'The email-identified support contact who sent this message. Mutually exclusive with created_by_id.';

DROP INDEX IF EXISTS idx_conv_participants__conversation_crm_contact;
DROP INDEX IF EXISTS idx_conv_participants__crm_contact_active;
DROP INDEX IF EXISTS idx_conv_participants__crm_contact_id;

ALTER TABLE conversation_participants
  DROP CONSTRAINT IF EXISTS chk_conversation_participants__identity,
  -- squawk-ignore ban-drop-column -- CRM producers and consumers are removed in this release.
  DROP COLUMN crm_contact_id,
  ADD CONSTRAINT chk_conversation_participants__identity
    CHECK (num_nonnulls(user_id, support_contact_id) = 1) NOT VALID;

ALTER TABLE conversation_participants
  VALIDATE CONSTRAINT chk_conversation_participants__identity;

COMMENT ON TABLE conversation_participants IS
  'Participants in a conversation. Each participant is a registered user or support contact. Enables multi-party threads.';
COMMENT ON COLUMN conversation_participants.user_id IS
  'Registered user participant. Mutually exclusive with support_contact_id.';
COMMENT ON COLUMN conversation_participants.support_contact_id IS
  'Email-identified support contact. Mutually exclusive with user_id.';

ALTER TABLE conversations
  ALTER COLUMN channel_type DROP DEFAULT,
  DROP CONSTRAINT IF EXISTS chk_conversations__modmail_columns;

DROP INDEX IF EXISTS idx_conversations__direct_message_updated;
DROP INDEX IF EXISTS idx_conversations__modmail_community_updated;
DROP INDEX IF EXISTS idx_conversations__modmail_subject_updated;
DROP INDEX IF EXISTS uq_conversations__modmail_open_per_subject;
DROP INDEX IF EXISTS uq_conversations__mod_internal_open_report;
DROP INDEX IF EXISTS uq_conversations__mod_internal_open_post;

CREATE TYPE conversation_channel_types__without_crm AS ENUM (
  'chat', 'customer_support', 'direct_message', 'modmail', 'mod_internal'
);

ALTER TABLE conversations
  -- squawk-ignore changing-column-type -- The CRM enum value and all matching conversations are deleted above.
  ALTER COLUMN channel_type TYPE conversation_channel_types__without_crm
  USING channel_type::text::conversation_channel_types__without_crm;

DROP TYPE conversation_channel_types;
ALTER TYPE conversation_channel_types__without_crm RENAME TO conversation_channel_types;

ALTER TABLE conversations
  ALTER COLUMN channel_type SET DEFAULT 'chat';

ALTER TABLE conversations
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

COMMENT ON COLUMN conversations.channel_type IS
  'Conversation channel: chat for user/agent chat and customer_support for support email threads.';

-- squawk-ignore ban-drop-table -- CRM producers and consumers are removed in this release.
DROP TABLE crm_contact_social_accounts;
-- squawk-ignore ban-drop-table -- CRM producers and consumers are removed in this release.
DROP TABLE crm_contact_lifecycle_changes;
-- squawk-ignore ban-drop-table -- CRM producers and consumers are removed in this release.
DROP TABLE crm_contacts;

DROP TYPE crm_contact_lifecycle_change_types;
DROP TYPE crm_contact_types;
DROP TYPE crm_contact_sources;
DROP TYPE crm_contact_verticals;
DROP TYPE crm_social_platforms;
DROP TYPE crm_email_providers;
