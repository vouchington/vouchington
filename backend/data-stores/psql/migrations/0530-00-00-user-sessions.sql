-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
-- Active user session registry keyed by UUIDv7 JWT sid.

DO $$ BEGIN
  CREATE TYPE user_session_authentication_origins AS ENUM ('web', 'native');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TABLE IF NOT EXISTS user_sessions (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users ON DELETE CASCADE,
  device_id UUID NOT NULL,
  authentication_origin user_session_authentication_origins NOT NULL,
  device_name TEXT NOT NULL DEFAULT 'Unknown device',
  user_agent_string_id UUID NOT NULL REFERENCES user_agent_strings ON DELETE RESTRICT,
  ip_address INET,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  device_token_digest TEXT,
  previous_device_token_digest TEXT,
  previous_device_token_grace_expires_at TIMESTAMPTZ,
  device_token_encrypted TEXT,
  device_token_issued_at TIMESTAMPTZ,
  device_token_binding JSONB,
  device_bound_session_binding JSONB,
  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (num_nonnulls(device_token_digest, device_token_encrypted, device_token_issued_at, device_token_binding) IN (0, 4)),
  CHECK (device_token_digest IS NULL OR device_token_digest ~ '^[a-f0-9]{64}$'),
  CHECK (num_nonnulls(previous_device_token_digest, previous_device_token_grace_expires_at) IN (0, 2)),
  CHECK (previous_device_token_digest IS NULL OR previous_device_token_digest ~ '^[a-f0-9]{64}$'),
  CHECK (previous_device_token_digest IS NULL OR device_token_digest IS NOT NULL),
  CHECK (device_token_binding IS NULL OR jsonb_typeof(device_token_binding) = 'object'),
  CHECK (device_bound_session_binding IS NULL OR (device_token_digest IS NOT NULL AND device_token_binding @> '{"client":"web"}'::jsonb AND jsonb_typeof(device_bound_session_binding) = 'object')),
  CHECK (device_token_issued_at IS NULL OR device_token_issued_at < expires_at),
  CHECK (TRIM(device_name) = device_name),
  CHECK (char_length(device_name) <= 255)
) PARTITION BY RANGE (id);

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE OR REPLACE TRIGGER trigger_user_sessions_updated_at
  BEFORE UPDATE ON user_sessions
  FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX IF NOT EXISTS idx_user_sessions__user_id_active_last_seen
  ON user_sessions (user_id, last_seen_at DESC, id DESC)
  WHERE revoked_at IS NULL;

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX IF NOT EXISTS idx_user_sessions__expires_at_id
  ON user_sessions (expires_at, id);

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX IF NOT EXISTS idx_user_sessions__user_agent_id
  ON user_sessions (user_agent_string_id)
  WHERE user_agent_string_id IS NOT NULL;

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX IF NOT EXISTS idx_user_sessions__user_id__foreign_key
  ON user_sessions (user_id)
  WHERE user_id IS NOT NULL;

COMMENT ON TABLE user_sessions IS 'User session registry keyed by UUIDv7 JWT sid. RANGE-partitioned by id with a default partition; bounded retention removes expired rows after the audit window. Rows hold durable device credential authority and revocation checked after cache misses, and support session listing and audit.';
COMMENT ON COLUMN user_sessions.user_id IS 'Owning user for this session row.';
COMMENT ON COLUMN user_sessions.device_id IS 'JWT device ID (dt.did) associated with this session.';
COMMENT ON COLUMN user_sessions.authentication_origin IS 'Server-controlled sign-in provenance; native is set only by native OTP or verified native OAuth broker completion.';
COMMENT ON COLUMN user_sessions.device_name IS 'Human-readable device label derived from the request user-agent when available.';
COMMENT ON COLUMN user_sessions.user_agent_string_id IS 'Normalized user-agent row for the raw browser user-agent captured for this session.';
COMMENT ON COLUMN user_sessions.ip_address IS 'Client IP address captured when the session was registered or refreshed.';
COMMENT ON COLUMN user_sessions.last_seen_at IS 'Most recent login/list/logout/revoke/refresh touch time for this session.';
COMMENT ON COLUMN user_sessions.expires_at IS 'Original device credential expiry when device authority is present; otherwise the registered access-session expiry. Ordinary refresh never extends it.';
COMMENT ON COLUMN user_sessions.revoked_at IS 'When the session was revoked. NULL means active.';

COMMENT ON COLUMN user_sessions.device_token_digest IS 'SHA-256 digest of the current signed device credential. Row-locked compare-and-set rotation detects reuse without storing plaintext credentials.';
COMMENT ON COLUMN user_sessions.previous_device_token_digest IS 'Immediately preceding signed device credential digest, accepted only during a bounded lost-response grace window under the session row lock.';
COMMENT ON COLUMN user_sessions.previous_device_token_grace_expires_at IS 'Deadline for idempotent replay of the immediately preceding device credential; older reuse revokes the session.';
COMMENT ON COLUMN user_sessions.device_token_encrypted IS 'Current device credential encrypted with token-secrets and a session-specific purpose, retained for exact credential-completion replay and signing-key rotation.';
COMMENT ON COLUMN user_sessions.device_token_issued_at IS 'Original authenticated device credential issuance time. Ordinary rotation preserves this revocation epoch.';
COMMENT ON COLUMN user_sessions.device_token_binding IS 'Original signed client binding document (client family and optional browser User-Agent/JA4 hashes), never joined to other rows. Verified credential replay preserves this document.';
COMMENT ON COLUMN user_sessions.device_bound_session_binding IS 'Chrome device-bound session public key, canonical origin and binding time; durable structured proof state, never joined to another row. Valkey retains only single-use challenges.';
