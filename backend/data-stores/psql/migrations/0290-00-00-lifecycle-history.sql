-- Append-only lifecycle history for CRM contacts and support workflows.

DO $$ BEGIN
  CREATE TYPE crm_contact_lifecycle_change_types AS ENUM (
    'manual_update',
    'mark_contacted',
    'mark_responded',
    'mark_converted',
    'clear_converted',
    'mark_opted_out',
    'clear_opted_out',
    'archive'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE support_thread_lifecycle_change_types AS ENUM (
    'assign',
    'resolve',
    'reopen'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE support_message_lifecycle_change_types AS ENUM (
    'create_draft',
    'edit_draft',
    'approve',
    'send'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS crm_contact_lifecycle_changes (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  crm_contact_id UUID NOT NULL REFERENCES crm_contacts(id) ON DELETE CASCADE,
  change_type crm_contact_lifecycle_change_types NOT NULL,
  changed_by_id UUID,
  note TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  contacted_at TIMESTAMPTZ,
  responded_at TIMESTAMPTZ,
  converted_at TIMESTAMPTZ,
  opted_out_at TIMESTAMPTZ,
  archived_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  CHECK (note IS NULL OR char_length(note) <= 1000),
  CHECK (jsonb_typeof(metadata) = 'object'),
  UNIQUE (crm_contact_id, id)
  -- no updated_at or deleted_at: append-only
);

CREATE INDEX IF NOT EXISTS idx_crm_contact_lifecycle_changes__contact_id__id
  ON crm_contact_lifecycle_changes (crm_contact_id, id DESC);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fk_crm_contacts_latest_lifecycle_change_id'
  ) THEN
    ALTER TABLE crm_contacts
      ADD CONSTRAINT fk_crm_contacts_latest_lifecycle_change_id
      FOREIGN KEY (id, latest_lifecycle_change_id)
      REFERENCES crm_contact_lifecycle_changes(crm_contact_id, id)
      ON DELETE SET NULL (latest_lifecycle_change_id);
  END IF;
END $$;

COMMENT ON TABLE crm_contact_lifecycle_changes IS 'Append-only audit log of CRM contact lifecycle transitions. Current lifecycle timestamps on crm_contacts are denormalized from the latest change.';
COMMENT ON COLUMN crm_contact_lifecycle_changes.crm_contact_id IS 'The CRM contact whose lifecycle changed.';
COMMENT ON COLUMN crm_contact_lifecycle_changes.change_type IS 'Type of lifecycle transition.';
COMMENT ON COLUMN crm_contact_lifecycle_changes.changed_by_id IS 'User or admin who initiated the change (no FK for audit persistence).';
COMMENT ON COLUMN crm_contact_lifecycle_changes.note IS 'Optional free-text note about the lifecycle transition.';
COMMENT ON COLUMN crm_contact_lifecycle_changes.metadata IS 'Structured metadata about the lifecycle transition.';
COMMENT ON COLUMN crm_contact_lifecycle_changes.contacted_at IS 'Snapshot of contacted_at after this lifecycle transition.';
COMMENT ON COLUMN crm_contact_lifecycle_changes.responded_at IS 'Snapshot of responded_at after this lifecycle transition.';
COMMENT ON COLUMN crm_contact_lifecycle_changes.converted_at IS 'Snapshot of converted_at after this lifecycle transition.';
COMMENT ON COLUMN crm_contact_lifecycle_changes.opted_out_at IS 'Snapshot of opted_out_at after this lifecycle transition.';
COMMENT ON COLUMN crm_contact_lifecycle_changes.archived_at IS 'Snapshot of archived_at after this lifecycle transition.';

CREATE TABLE IF NOT EXISTS support_thread_lifecycle_changes (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  support_thread_id UUID NOT NULL REFERENCES support_threads(id) ON DELETE CASCADE,
  change_type support_thread_lifecycle_change_types NOT NULL,
  changed_by_id UUID,
  note TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  assigned_at TIMESTAMPTZ,
  assigned_to_id UUID,
  resolved_at TIMESTAMPTZ,
  resolved_by_id UUID,
  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  CHECK (note IS NULL OR char_length(note) <= 1000),
  CHECK (jsonb_typeof(metadata) = 'object'),
  UNIQUE (support_thread_id, id)
  -- no updated_at or deleted_at: append-only
);

CREATE INDEX IF NOT EXISTS idx_support_thread_lifecycle_changes__thread_id__id
  ON support_thread_lifecycle_changes (support_thread_id, id DESC);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fk_support_threads_latest_lifecycle_change_id'
  ) THEN
    ALTER TABLE support_threads
      ADD CONSTRAINT fk_support_threads_latest_lifecycle_change_id
      FOREIGN KEY (id, latest_lifecycle_change_id)
      REFERENCES support_thread_lifecycle_changes(support_thread_id, id)
      ON DELETE SET NULL (latest_lifecycle_change_id);
  END IF;
END $$;

COMMENT ON TABLE support_thread_lifecycle_changes IS 'Append-only audit log of support thread lifecycle transitions. Current lifecycle timestamps on support_threads are denormalized from the latest change.';
COMMENT ON COLUMN support_thread_lifecycle_changes.support_thread_id IS 'The support thread whose lifecycle changed.';
COMMENT ON COLUMN support_thread_lifecycle_changes.change_type IS 'Type of lifecycle transition.';
COMMENT ON COLUMN support_thread_lifecycle_changes.changed_by_id IS 'User or admin who initiated the change (no FK for audit persistence).';
COMMENT ON COLUMN support_thread_lifecycle_changes.note IS 'Optional free-text note about the lifecycle transition.';
COMMENT ON COLUMN support_thread_lifecycle_changes.metadata IS 'Structured metadata about the lifecycle transition.';
COMMENT ON COLUMN support_thread_lifecycle_changes.assigned_at IS 'Snapshot of assigned_at after this lifecycle transition.';
COMMENT ON COLUMN support_thread_lifecycle_changes.assigned_to_id IS 'Snapshot of assigned_to_id after this lifecycle transition.';
COMMENT ON COLUMN support_thread_lifecycle_changes.resolved_at IS 'Snapshot of resolved_at after this lifecycle transition.';
COMMENT ON COLUMN support_thread_lifecycle_changes.resolved_by_id IS 'Snapshot of resolved_by_id after this lifecycle transition.';

CREATE TABLE IF NOT EXISTS support_message_lifecycle_changes (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  support_thread_id UUID NOT NULL,
  support_message_id UUID NOT NULL,
  change_type support_message_lifecycle_change_types NOT NULL,
  changed_by_id UUID,
  note TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  drafted_at TIMESTAMPTZ,
  edited_at TIMESTAMPTZ,
  edited_by_id UUID,
  approved_at TIMESTAMPTZ,
  approved_by_id UUID,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  CHECK (note IS NULL OR char_length(note) <= 1000),
  CHECK (jsonb_typeof(metadata) = 'object'),
  UNIQUE (support_thread_id, support_message_id, id),
  FOREIGN KEY (support_thread_id, support_message_id)
    REFERENCES support_messages (support_thread_id, id) ON DELETE CASCADE
  -- no updated_at or deleted_at: append-only
);

CREATE INDEX IF NOT EXISTS idx_support_message_lifecycle_changes__message_id__id
  ON support_message_lifecycle_changes (support_thread_id, support_message_id, id DESC);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fk_support_messages_latest_lifecycle_change_id'
  ) THEN
    ALTER TABLE support_messages
      ADD CONSTRAINT fk_support_messages_latest_lifecycle_change_id
      FOREIGN KEY (support_thread_id, id, latest_lifecycle_change_id)
      REFERENCES support_message_lifecycle_changes(support_thread_id, support_message_id, id)
      ON DELETE SET NULL (latest_lifecycle_change_id);
  END IF;
END $$;

COMMENT ON TABLE support_message_lifecycle_changes IS 'Append-only audit log of support message lifecycle transitions. Current lifecycle timestamps on support_messages are denormalized from the latest change.';
COMMENT ON COLUMN support_message_lifecycle_changes.support_thread_id IS 'Support thread containing the message whose lifecycle changed.';
COMMENT ON COLUMN support_message_lifecycle_changes.support_message_id IS 'Support message whose lifecycle changed.';
COMMENT ON COLUMN support_message_lifecycle_changes.change_type IS 'Type of lifecycle transition.';
COMMENT ON COLUMN support_message_lifecycle_changes.changed_by_id IS 'User or admin who initiated the change (no FK for audit persistence).';
COMMENT ON COLUMN support_message_lifecycle_changes.note IS 'Optional free-text note about the lifecycle transition.';
COMMENT ON COLUMN support_message_lifecycle_changes.metadata IS 'Structured metadata about the lifecycle transition.';
COMMENT ON COLUMN support_message_lifecycle_changes.drafted_at IS 'Snapshot of drafted_at after this lifecycle transition.';
COMMENT ON COLUMN support_message_lifecycle_changes.edited_at IS 'Snapshot of edited_at after this lifecycle transition.';
COMMENT ON COLUMN support_message_lifecycle_changes.edited_by_id IS 'Snapshot of edited_by_id after this lifecycle transition.';
COMMENT ON COLUMN support_message_lifecycle_changes.approved_at IS 'Snapshot of approved_at after this lifecycle transition.';
COMMENT ON COLUMN support_message_lifecycle_changes.approved_by_id IS 'Snapshot of approved_by_id after this lifecycle transition.';
COMMENT ON COLUMN support_message_lifecycle_changes.sent_at IS 'Snapshot of sent_at after this lifecycle transition.';
