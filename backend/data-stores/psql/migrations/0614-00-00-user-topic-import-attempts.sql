CREATE TABLE IF NOT EXISTS user_topic_import_attempts (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  idempotency_key UUID NOT NULL,
  intent_sha256 TEXT NOT NULL,
  response JSONB,
  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMPTZ,
  retention_expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '48 hours'),
  CONSTRAINT user_topic_import_attempts_user_key_unique UNIQUE (user_id, idempotency_key),
  CONSTRAINT user_topic_import_attempts_intent_sha256_check CHECK (
    char_length(intent_sha256) = 64 AND intent_sha256 = LOWER(intent_sha256)
  ),
  CONSTRAINT user_topic_import_attempts_response_check CHECK (
    (response IS NULL AND completed_at IS NULL)
    OR (
      response IS NOT NULL
      AND completed_at IS NOT NULL
      AND jsonb_typeof(response) = 'array'
      AND octet_length(response::text) <= 4194304
    )
  )
);

CREATE OR REPLACE TRIGGER trigger_user_topic_import_attempts_updated_at
BEFORE UPDATE ON user_topic_import_attempts
FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();

CREATE INDEX IF NOT EXISTS idx_user_topic_import_attempts__retention
ON user_topic_import_attempts (retention_expires_at, id);

COMMENT ON TABLE user_topic_import_attempts IS 'Bounded actor-owned exact response replays for topic-import batches; completed and abandoned attempts expire after 48 hours.';
COMMENT ON COLUMN user_topic_import_attempts.user_id IS 'Authenticated user who owns this idempotency key and exact import replay.';
COMMENT ON COLUMN user_topic_import_attempts.idempotency_key IS 'Client-supplied UUID that identifies one exact ordered topic-import intent for this user.';
COMMENT ON COLUMN user_topic_import_attempts.intent_sha256 IS 'SHA-256 of the canonical ordered import batch; reuse with different input is rejected.';
COMMENT ON COLUMN user_topic_import_attempts.response IS 'Exact ordered successful response returned by the completed import batch.';
COMMENT ON COLUMN user_topic_import_attempts.completed_at IS 'Clock timestamp at which audit, follow, and exact replay state committed atomically.';
COMMENT ON COLUMN user_topic_import_attempts.retention_expires_at IS 'Indexed deletion boundary for completed replays and abandoned pending attempts.';
