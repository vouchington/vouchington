-- Coalesced pre-launch domain baseline.
-- edited-in-place: pre-launch, never deployed to production
-- Merged from: 0330-00-00-user-import-requests.sql, 0330-00-01-user-rss-feed-imports.sql
DO $$
BEGIN
  CREATE TYPE user_import_request_entity_types AS ENUM ('topic', 'rss_feed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS user_import_requests (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  entity_type user_import_request_entity_types NOT NULL,
  topic_id UUID REFERENCES topics(id) ON DELETE CASCADE,
  rss_feed_id UUID REFERENCES rss_feeds(id) ON DELETE CASCADE,
  topic_recommendation_post_id UUID REFERENCES post_topic_recommendations(post_id) ON DELETE CASCADE,
  input_value TEXT NOT NULL,
  followed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (input_value = TRIM(input_value)),
  CHECK (char_length(input_value) > 0),
  CHECK (
    (
      entity_type = 'topic'
      AND rss_feed_id IS NULL
      AND (
        topic_id IS NOT NULL
        OR topic_recommendation_post_id IS NOT NULL
      )
    )
    OR (
      entity_type = 'rss_feed'
      AND topic_id IS NULL
      AND topic_recommendation_post_id IS NULL
      AND rss_feed_id IS NOT NULL
    )
  ),
  CHECK (
    (
      followed_at IS NULL
      AND topic_id IS NULL
      AND rss_feed_id IS NULL
    )
    OR (
      followed_at IS NOT NULL
      AND (
        topic_id IS NOT NULL
        OR rss_feed_id IS NOT NULL
      )
    )
  )
);

CREATE OR REPLACE TRIGGER trigger_user_import_requests_updated_at
BEFORE UPDATE ON user_import_requests
FOR EACH ROW
EXECUTE FUNCTION fn_update_updated_at();

CREATE INDEX IF NOT EXISTS idx_user_import_requests__user_id__id_desc
ON user_import_requests (user_id, id DESC);

CREATE INDEX IF NOT EXISTS idx_user_import_requests__topic_recommendation
ON user_import_requests (topic_recommendation_post_id)
WHERE topic_recommendation_post_id IS NOT NULL AND followed_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_import_requests__user_topic_recommendation
ON user_import_requests (user_id, topic_recommendation_post_id)
WHERE topic_recommendation_post_id IS NOT NULL;
COMMENT ON INDEX idx_user_import_requests__user_topic_recommendation IS 'Makes one missing-topic audit durable per user and recommendation across exact import retries.';

COMMENT ON TABLE user_import_requests IS 'Tracks user import requests so imported or later-approved entities can be followed for the requesting user.';
COMMENT ON COLUMN user_import_requests.user_id IS 'The user who submitted the import request.';
COMMENT ON COLUMN user_import_requests.entity_type IS 'The imported entity family.';
COMMENT ON COLUMN user_import_requests.topic_id IS 'Topic followed directly or after recommendation approval.';
COMMENT ON COLUMN user_import_requests.rss_feed_id IS 'RSS feed followed directly or after recommendation approval.';
COMMENT ON COLUMN user_import_requests.topic_recommendation_post_id IS 'Pending topic recommendation created by the import request.';
COMMENT ON COLUMN user_import_requests.input_value IS 'Trimmed user-provided import value.';
COMMENT ON COLUMN user_import_requests.followed_at IS 'When the user was linked to the imported entity.';

DO $$
BEGIN
  CREATE TYPE user_rss_feed_import_row_outcomes AS ENUM (
    'followed',
    'imported',
    'source_created',
    'already_following',
    'error'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS user_rss_feed_import_batches (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  follow BOOLEAN NOT NULL DEFAULT TRUE,
  total_rows INT NOT NULL CHECK (total_rows > 0 AND total_rows <= 500),
  completed_rows INT NOT NULL DEFAULT 0 CHECK (completed_rows >= 0),
  failed_rows INT NOT NULL DEFAULT 0 CHECK (failed_rows >= 0),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_user_rss_feed_import_batches__lifecycle CHECK (
    completed_rows + failed_rows <= total_rows
    AND (completed_at IS NOT NULL) = (completed_rows + failed_rows = total_rows)
  )
);

CREATE OR REPLACE TRIGGER trigger_user_rss_feed_import_batches_updated_at
BEFORE UPDATE ON user_rss_feed_import_batches
FOR EACH ROW
EXECUTE FUNCTION fn_update_updated_at();

CREATE OR REPLACE TRIGGER trigger_user_rss_feed_import_batches_guard_terminal_lifecycle
BEFORE UPDATE ON user_rss_feed_import_batches
FOR EACH ROW
EXECUTE FUNCTION fn_guard_terminal_lifecycle('completed_at');

CREATE INDEX IF NOT EXISTS idx_user_rss_feed_import_batches__user_id__id_desc
ON user_rss_feed_import_batches (user_id, id DESC);

CREATE TABLE IF NOT EXISTS user_rss_feed_import_rows (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  batch_id UUID NOT NULL REFERENCES user_rss_feed_import_batches(id) ON DELETE CASCADE,
  row_index INT NOT NULL CHECK (row_index >= 0),
  input_url TEXT NOT NULL,
  canonical_url TEXT,
  outcome user_rss_feed_import_row_outcomes,
  rss_feed_id UUID REFERENCES rss_feeds(id) ON DELETE SET NULL,
  completed_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  error_message TEXT CHECK (error_message IS NULL OR error_message = TRIM(error_message)),
  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (input_url = TRIM(input_url)),
  CHECK (char_length(input_url) > 0),
  CHECK (canonical_url IS NULL OR canonical_url = TRIM(canonical_url)),
  CONSTRAINT chk_user_rss_feed_import_rows__lifecycle CHECK (
    (outcome IS NULL AND completed_at IS NULL AND failed_at IS NULL)
    OR (
      outcome = 'error'
      AND completed_at IS NULL
      AND failed_at IS NOT NULL
      AND error_message IS NOT NULL
    )
    OR (
      outcome <> 'error'
      AND completed_at IS NOT NULL
      AND failed_at IS NULL
      AND rss_feed_id IS NOT NULL
    )
  ),
  CONSTRAINT user_rss_feed_import_rows__batch_row_index UNIQUE (batch_id, row_index)
);

CREATE OR REPLACE TRIGGER trigger_user_rss_feed_import_rows_updated_at
BEFORE UPDATE ON user_rss_feed_import_rows
FOR EACH ROW
EXECUTE FUNCTION fn_update_updated_at();

CREATE OR REPLACE TRIGGER trigger_user_rss_feed_import_rows_guard_terminal_lifecycle
BEFORE UPDATE ON user_rss_feed_import_rows
FOR EACH ROW
EXECUTE FUNCTION fn_guard_terminal_lifecycle('completed_at', 'failed_at');

CREATE INDEX IF NOT EXISTS idx_user_rss_feed_import_rows__batch_id__row_index
ON user_rss_feed_import_rows (batch_id, row_index);

COMMENT ON TABLE user_rss_feed_import_batches IS 'Tracks user-submitted RSS feed import batches processed asynchronously.';
COMMENT ON COLUMN user_rss_feed_import_batches.user_id IS 'The user who submitted the RSS feed import.';
COMMENT ON COLUMN user_rss_feed_import_batches.follow IS 'Whether successful imported feeds should be followed by the submitting user.';
COMMENT ON COLUMN user_rss_feed_import_batches.total_rows IS 'Total number of URLs in this import batch.';
COMMENT ON COLUMN user_rss_feed_import_batches.completed_rows IS 'Number of rows that completed with a non-error outcome.';
COMMENT ON COLUMN user_rss_feed_import_batches.failed_rows IS 'Number of rows that reached a terminal error outcome.';
COMMENT ON COLUMN user_rss_feed_import_batches.completed_at IS 'When every row reached a terminal success or error outcome.';
COMMENT ON TABLE user_rss_feed_import_rows IS 'Individual RSS feed import URLs and per-row processing outcomes.';
COMMENT ON COLUMN user_rss_feed_import_rows.batch_id IS 'The RSS feed import batch this row belongs to.';
COMMENT ON COLUMN user_rss_feed_import_rows.row_index IS 'Zero-based position of the input URL in the submitted import.';
COMMENT ON COLUMN user_rss_feed_import_rows.input_url IS 'Trimmed user-submitted RSS feed URL.';
COMMENT ON COLUMN user_rss_feed_import_rows.canonical_url IS 'Validated canonical URL used for RSS feed lookup or creation.';
COMMENT ON COLUMN user_rss_feed_import_rows.outcome IS 'Terminal per-row import result. NULL means pending or retrying.';
COMMENT ON COLUMN user_rss_feed_import_rows.rss_feed_id IS 'RSS feed resolved or created for this row.';
COMMENT ON COLUMN user_rss_feed_import_rows.completed_at IS 'When this row completed with a non-error outcome.';
COMMENT ON COLUMN user_rss_feed_import_rows.failed_at IS 'When this row reached a terminal error outcome.';
COMMENT ON COLUMN user_rss_feed_import_rows.error_message IS 'Most recent row processing error, terminal only when outcome is error.';
