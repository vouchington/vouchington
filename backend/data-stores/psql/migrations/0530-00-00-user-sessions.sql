-- edited-in-place: pre-launch, never deployed to production
-- Active user session registry keyed by UUIDv7 JWT sid.

CREATE TABLE IF NOT EXISTS web_user_agents (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  user_agent TEXT NOT NULL UNIQUE DEFAULT '',
  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (TRIM(user_agent) = user_agent),
  CHECK (char_length(user_agent) <= 1024)
);

CREATE OR REPLACE TRIGGER trigger_web_user_agents_updated_at
  BEFORE UPDATE ON web_user_agents
  FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();

CREATE TABLE IF NOT EXISTS user_sessions (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users ON DELETE CASCADE,
  device_id UUID NOT NULL,
  device_name TEXT NOT NULL DEFAULT 'Unknown device',
  user_agent_id UUID NOT NULL REFERENCES web_user_agents ON DELETE RESTRICT,
  ip_address INET,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (TRIM(device_name) = device_name),
  CHECK (char_length(device_name) <= 255)
) PARTITION BY RANGE (id);

CREATE OR REPLACE TRIGGER trigger_user_sessions_updated_at
  BEFORE UPDATE ON user_sessions
  FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();

CREATE INDEX IF NOT EXISTS idx_user_sessions__user_id_active_last_seen
  ON user_sessions (user_id, last_seen_at DESC, id DESC)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_user_sessions__expires_at_active
  ON user_sessions (expires_at)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_user_sessions__user_agent_id
  ON user_sessions (user_agent_id)
  WHERE user_agent_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_user_sessions__user_id__fk
  ON user_sessions (user_id)
  WHERE user_id IS NOT NULL;

COMMENT ON TABLE user_sessions IS 'Active user session registry keyed by UUIDv7 JWT sid. RANGE-partitioned by id with a default partition only; split later by adding explicit range partitions. Rows are inserted on login and refreshed on session updates so the API can list, revoke, and audit active sessions without touching the hot auth-request path.';
COMMENT ON TABLE web_user_agents IS 'Normalized browser user-agent strings captured by web-facing request flows.';
COMMENT ON COLUMN web_user_agents.user_agent IS 'Raw browser user-agent string captured from a web request.';
COMMENT ON COLUMN user_sessions.user_id IS 'Owning user for this session row.';
COMMENT ON COLUMN user_sessions.device_id IS 'JWT device ID (dt.did) associated with this session.';
COMMENT ON COLUMN user_sessions.device_name IS 'Human-readable device label derived from the request user-agent when available.';
COMMENT ON COLUMN user_sessions.user_agent_id IS 'Normalized user-agent row for the raw browser user-agent captured for this session.';
COMMENT ON COLUMN user_sessions.ip_address IS 'Client IP address captured when the session was registered or refreshed.';
COMMENT ON COLUMN user_sessions.last_seen_at IS 'Most recent login/list/logout/revoke/refresh touch time for this session.';
COMMENT ON COLUMN user_sessions.expires_at IS 'JWT session expiration timestamp.';
COMMENT ON COLUMN user_sessions.revoked_at IS 'When the session was revoked. NULL means active.';
