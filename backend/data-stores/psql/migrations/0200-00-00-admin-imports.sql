-- Coalesced pre-launch domain baseline.
-- edited-in-place: pre-launch, never deployed to production
-- Merged from: 0232-00-00-admin-import-batches.sql

-- ==========================================================================
-- 0232-00-00-admin-import-batches.sql
-- ============================================================================

DO $$ BEGIN
  CREATE TYPE admin_import_types AS ENUM ('topic', 'rss_feed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS admin_import_batches (
  id UUID DEFAULT uuidv7() PRIMARY KEY,
  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  import_type admin_import_types NOT NULL,
  created_by_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  total_rows INT NOT NULL CHECK (total_rows > 0 AND total_rows <= 50000),
  completed_rows INT NOT NULL DEFAULT 0 CHECK (completed_rows >= 0),
  failed_rows INT NOT NULL DEFAULT 0 CHECK (failed_rows >= 0),
  completed_at TIMESTAMPTZ,
  metadata_source TEXT CHECK (
    metadata_source IS NULL OR (
      char_length(metadata_source) BETWEEN 1 AND 1024
      AND metadata_source = TRIM(metadata_source)
    )
  ),
  metadata_version INT CHECK (metadata_version IS NULL OR metadata_version >= 0),
  CONSTRAINT chk_admin_import_batches__lifecycle CHECK (
    completed_rows + failed_rows <= total_rows
    AND (completed_at IS NOT NULL) = (completed_rows + failed_rows = total_rows)
  )
);

CREATE TRIGGER trigger_admin_import_batches_updated_at
  BEFORE UPDATE ON admin_import_batches
  FOR EACH ROW
  EXECUTE FUNCTION fn_update_updated_at();

CREATE TRIGGER trigger_admin_import_batches_guard_terminal_lifecycle
  BEFORE UPDATE ON admin_import_batches
  FOR EACH ROW
  EXECUTE FUNCTION fn_guard_terminal_lifecycle('completed_at');

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

CREATE INDEX IF NOT EXISTS idx_admin_import_batches__created_by
  ON admin_import_batches (created_by_id);

COMMENT ON TABLE admin_import_batches IS 'Tracks bulk import operations initiated by admins, with progress counters.';
COMMENT ON COLUMN admin_import_batches.import_type IS 'The type of entities being imported: topic or RSS feed.';
COMMENT ON COLUMN admin_import_batches.total_rows IS 'Total number of rows in this import batch (max 50000).';
COMMENT ON COLUMN admin_import_batches.completed_rows IS 'Number of rows successfully imported so far.';
COMMENT ON COLUMN admin_import_batches.failed_rows IS 'Number of rows that failed to import.';
COMMENT ON COLUMN admin_import_batches.completed_at IS 'When the entire batch finished processing.';
COMMENT ON COLUMN admin_import_batches.metadata_source IS 'Optional source label for the import, such as a file name.';
COMMENT ON COLUMN admin_import_batches.metadata_version IS 'Optional non-negative format version supplied with the import.';

CREATE TABLE IF NOT EXISTS admin_import_rows (
  id UUID DEFAULT uuidv7() PRIMARY KEY,
  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  batch_id UUID NOT NULL REFERENCES admin_import_batches(id) ON DELETE CASCADE,
  row_index INT NOT NULL CHECK (row_index >= 0),
  topic_id UUID REFERENCES topics ON DELETE RESTRICT,
  rss_feed_id UUID REFERENCES rss_feeds ON DELETE RESTRICT,
  completed_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  error_message TEXT CHECK (TRIM(error_message) = error_message),
  CONSTRAINT chk_admin_import_rows__lifecycle CHECK (
    (completed_at IS NULL OR failed_at IS NULL)
    AND (failed_at IS NULL OR error_message IS NOT NULL)
  ),
  CONSTRAINT chk_admin_import_rows__created_entity_lifecycle CHECK (
    (completed_at IS NULL AND num_nonnulls(topic_id, rss_feed_id) = 0)
    OR (completed_at IS NOT NULL AND num_nonnulls(topic_id, rss_feed_id) = 1)
  ),
  CONSTRAINT admin_import_rows__batch_row_index UNIQUE (batch_id, row_index)
);

CREATE TRIGGER trigger_admin_import_rows_updated_at
  BEFORE UPDATE ON admin_import_rows
  FOR EACH ROW
  EXECUTE FUNCTION fn_update_updated_at();

CREATE TRIGGER trigger_admin_import_rows_guard_terminal_lifecycle
  BEFORE UPDATE ON admin_import_rows
  FOR EACH ROW
  EXECUTE FUNCTION fn_guard_terminal_lifecycle('completed_at', 'failed_at');

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

CREATE INDEX IF NOT EXISTS idx_admin_import_rows__batch_id
  ON admin_import_rows (batch_id);

-- RI-usable indexes for the created-entity FKs
CREATE INDEX IF NOT EXISTS idx_admin_import_rows__topic_id
  ON admin_import_rows (topic_id) WHERE topic_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_admin_import_rows__rss_feed_id
  ON admin_import_rows (rss_feed_id) WHERE rss_feed_id IS NOT NULL;

COMMENT ON TABLE admin_import_rows IS 'Individual rows within an admin import batch, tracking per-row input, status, and errors.';
COMMENT ON COLUMN admin_import_rows.batch_id IS 'The import batch this row belongs to.';
COMMENT ON COLUMN admin_import_rows.row_index IS 'Zero-based position of this row within the batch.';
COMMENT ON COLUMN admin_import_rows.topic_id IS 'Topic created or updated by this import row.';

CREATE TABLE IF NOT EXISTS admin_import_topic_rows (
  admin_import_row_id UUID PRIMARY KEY REFERENCES admin_import_rows ON DELETE CASCADE,
  slug TEXT NOT NULL CHECK (char_length(slug) BETWEEN 1 AND 255),
  name TEXT,
  topic_type TEXT,
  markdown TEXT,
  rss_feed_url TEXT,
  rss_feed_title TEXT,
  feed_type TEXT,
  aliases TEXT,
  parent_slugs TEXT,
  extensions TEXT,
  notes TEXT,
  referral_validation_slug TEXT,
  referral_user_help_text TEXT,
  referral_hostname TEXT,
  referral_pathname TEXT,
  referral_example_url TEXT,
  referral_company_slug TEXT
);

CREATE TABLE IF NOT EXISTS admin_import_rss_feed_rows (
  admin_import_row_id UUID PRIMARY KEY REFERENCES admin_import_rows ON DELETE CASCADE,
  url TEXT NOT NULL CHECK (char_length(url) BETWEEN 1 AND 2083),
  follow BOOLEAN
);

CREATE OR REPLACE FUNCTION fn_admin_import_topic_row_matches_batch()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  batch_import_type admin_import_types;
BEGIN
  SELECT batches.import_type
  INTO STRICT batch_import_type
  FROM admin_import_rows rows
  JOIN admin_import_batches batches ON batches.id = rows.batch_id
  WHERE rows.id = NEW.admin_import_row_id;

  IF batch_import_type <> 'topic' THEN
    RAISE EXCEPTION 'topic import input does not match batch import type %', batch_import_type
      USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (
    SELECT 1 FROM admin_import_rss_feed_rows
    WHERE admin_import_row_id = NEW.admin_import_row_id
  ) THEN
    RAISE EXCEPTION 'admin import row cannot own both topic and RSS feed input'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION fn_admin_import_rss_feed_row_matches_batch()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  batch_import_type admin_import_types;
BEGIN
  SELECT batches.import_type
  INTO STRICT batch_import_type
  FROM admin_import_rows rows
  JOIN admin_import_batches batches ON batches.id = rows.batch_id
  WHERE rows.id = NEW.admin_import_row_id;

  IF batch_import_type <> 'rss_feed' THEN
    RAISE EXCEPTION 'RSS feed import input does not match batch import type %', batch_import_type
      USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (
    SELECT 1 FROM admin_import_topic_rows
    WHERE admin_import_row_id = NEW.admin_import_row_id
  ) THEN
    RAISE EXCEPTION 'admin import row cannot own both topic and RSS feed input'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_admin_import_topic_rows_match_batch
  BEFORE INSERT OR UPDATE ON admin_import_topic_rows
  FOR EACH ROW
  EXECUTE FUNCTION fn_admin_import_topic_row_matches_batch();

CREATE TRIGGER trigger_admin_import_rss_feed_rows_match_batch
  BEFORE INSERT OR UPDATE ON admin_import_rss_feed_rows
  FOR EACH ROW
  EXECUTE FUNCTION fn_admin_import_rss_feed_row_matches_batch();

COMMENT ON TABLE admin_import_topic_rows IS 'Typed topic-import input for one admin import row.';
COMMENT ON TABLE admin_import_rss_feed_rows IS 'Typed RSS-feed import input for one admin import row. NULL follow means the caller omitted it.';
COMMENT ON COLUMN admin_import_rss_feed_rows.follow IS 'Whether to follow the imported feed. NULL when the input omitted follow.';
COMMENT ON COLUMN admin_import_rows.rss_feed_id IS 'RSS feed created or updated by this import row.';
COMMENT ON COLUMN admin_import_rows.completed_at IS 'When this row was successfully imported.';
COMMENT ON COLUMN admin_import_rows.failed_at IS 'When this row failed to import.';
COMMENT ON COLUMN admin_import_rows.error_message IS 'Error message if the row failed to import.';
