CREATE TABLE IF NOT EXISTS user_mcp_create_attempts (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  idempotency_key UUID NOT NULL,
  intent_sha256 TEXT NOT NULL,
  response JSONB,
  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  claimed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lease_token UUID NOT NULL DEFAULT uuidv7(),
  completed_at TIMESTAMPTZ,
  CONSTRAINT user_mcp_create_attempts_user_key_unique UNIQUE (user_id, idempotency_key),
  CONSTRAINT user_mcp_create_attempts_intent_sha256_check CHECK (
    char_length(intent_sha256) = 64 AND intent_sha256 = LOWER(intent_sha256)
  ),
  CONSTRAINT user_mcp_create_attempts_response_check CHECK (
    (response IS NULL AND completed_at IS NULL)
    OR (
      response IS NOT NULL
      AND completed_at IS NOT NULL
      AND jsonb_typeof(response) = 'object'
      AND octet_length(response::text) <= 65536
    )
  )
);

CREATE OR REPLACE TRIGGER trigger_user_mcp_create_attempts_updated_at
BEFORE UPDATE ON user_mcp_create_attempts
FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();

COMMENT ON TABLE user_mcp_create_attempts IS 'Actor-owned exact response replays for the delegated MCP create tools that have no post to bind to (community, report, dispute, appeal and community application). One row per credential owner and idempotency key; the row stays so a retry of a completed create keeps returning the first result.';
COMMENT ON COLUMN user_mcp_create_attempts.user_id IS 'Credential owner who supplied this idempotency key; the replay is visible only to them.';
COMMENT ON COLUMN user_mcp_create_attempts.idempotency_key IS 'Caller-supplied UUID identifying one exact create request for this credential owner.';
COMMENT ON COLUMN user_mcp_create_attempts.intent_sha256 IS 'SHA-256 of the canonical tool name and arguments; reusing the key with a different request is rejected.';
COMMENT ON COLUMN user_mcp_create_attempts.response IS 'Exact structured result the completed create returned, replayed on every retry of the same key and request.';
COMMENT ON COLUMN user_mcp_create_attempts.claimed_at IS 'When the in-flight create claimed the key; an unfinished claim older than the lease may be taken over by a retry.';
COMMENT ON COLUMN user_mcp_create_attempts.lease_token IS 'Opaque fencing token rotated on each claim and takeover; completion and release compare it for equality, so a holder whose lease was taken over can neither finish nor free the newer holder''s claim. It identifies no durable row.';
COMMENT ON COLUMN user_mcp_create_attempts.completed_at IS 'When the create finished and its response was stored; null while the create is still running.';
