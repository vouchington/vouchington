-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
-- Coalesced pre-launch domain baseline.
-- edited-in-place: pre-launch, never deployed to production
-- Merged from: 0340-00-00-mfa-totp-authenticators.sql, 0190-00-00-api-keys.sql

-- ==========================================================================
-- 0340-00-00-mfa-totp-authenticators.sql
-- ============================================================================

-- TOTP authenticator apps registered by users for multi-factor authentication.
-- Each row represents one registered authenticator (e.g. Google Authenticator, Authy).
-- Users can have multiple TOTP authenticators; any single one satisfies MFA.
-- verified_at is NULL until the user enters a valid code during setup.

CREATE TABLE IF NOT EXISTS user_totp_authenticators (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  secret_ciphertext TEXT NOT NULL,
  name TEXT NOT NULL CHECK (char_length(name) >= 1 AND char_length(name) <= 100 AND TRIM(name) = name),
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE OR REPLACE TRIGGER trigger_user_totp_authenticators_updated_at
  BEFORE UPDATE ON user_totp_authenticators
  FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();

CREATE INDEX IF NOT EXISTS idx_user_totp_authenticators__user_id
  ON user_totp_authenticators (user_id);

COMMENT ON TABLE user_totp_authenticators IS 'TOTP authenticator apps registered by users for multi-factor authentication. Any single verified authenticator satisfies the MFA requirement.';
COMMENT ON COLUMN user_totp_authenticators.user_id IS 'The user who registered this TOTP authenticator.';
COMMENT ON COLUMN user_totp_authenticators.secret_ciphertext IS 'Encrypted TOTP shared secret ciphertext used to generate and verify time-based one-time passwords.';
COMMENT ON COLUMN user_totp_authenticators.name IS 'User-chosen display name for this authenticator (1-100 chars, trimmed).';
COMMENT ON COLUMN user_totp_authenticators.verified_at IS 'When the user first verified a code from this authenticator, confirming setup is complete. NULL means setup is incomplete and the authenticator is not active.';

-- ==========================================================================
-- 0190-00-00-api-keys.sql
-- ============================================================================

DO $$ BEGIN
  CREATE TYPE api_key_types AS ENUM ('rss', 'mcp');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- api_keys
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TABLE IF NOT EXISTS api_keys (
  id UUID DEFAULT uuidv7() PRIMARY KEY REFERENCES retained_api_key_identities (id) ON DELETE RESTRICT,
  user_id UUID NOT NULL REFERENCES users ON DELETE CASCADE,
  prefix TEXT NOT NULL,
  key_hash BYTEA NOT NULL,
  type api_key_types NOT NULL DEFAULT 'rss',
  label TEXT NOT NULL DEFAULT '',
  scopes api_scopes[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  last_used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  replaced_by_api_key_id UUID REFERENCES api_keys ON DELETE SET NULL,
  expiry_reminder_sent_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  CHECK (prefix = TRIM(prefix)),
  CHECK (char_length(prefix) BETWEEN 8 AND 16),
  CHECK (OCTET_LENGTH(key_hash) = 32),
  CHECK (label = TRIM(label)),
  CHECK (char_length(label) <= 100)
);

CREATE OR REPLACE TRIGGER trigger_register_retained_api_key_identity
  BEFORE INSERT ON api_keys FOR EACH ROW EXECUTE FUNCTION fn_register_retained_identity('api_key');

CREATE OR REPLACE TRIGGER trigger_api_keys_updated_at
  BEFORE UPDATE ON api_keys FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();

CREATE UNIQUE INDEX IF NOT EXISTS idx_api_keys__key_hash ON api_keys (key_hash) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_api_keys__user_id ON api_keys (user_id, id DESC) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_api_keys__replaced_by_api_key_id__fk ON api_keys (replaced_by_api_key_id) WHERE replaced_by_api_key_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_api_keys__expiry_reminder ON api_keys (expires_at, id) WHERE revoked_at IS NULL AND replaced_by_api_key_id IS NULL AND expiry_reminder_sent_at IS NULL;

COMMENT ON TABLE api_keys IS 'User-issued API keys for programmatic access (format: voucha_<type>_<32 hex random>_<16 hex checksum>), stored as SHA-256 hashes.';
COMMENT ON COLUMN api_keys.user_id IS 'The user who owns this API key.';
COMMENT ON COLUMN api_keys.prefix IS 'Visible prefix of the API key for identification (e.g. voucha_rss_XXXX, 8-16 chars).';
COMMENT ON COLUMN api_keys.key_hash IS 'SHA-256 hash of the full API key (32 bytes).';
COMMENT ON COLUMN api_keys.type IS 'Key type scope (rss or mcp). Determines which API features the key can access.';
COMMENT ON COLUMN api_keys.label IS 'User-provided label to identify the key''s purpose.';
COMMENT ON COLUMN api_keys.scopes IS 'Canonical scope set granted to this key; validated against the application scope catalogue.';
COMMENT ON COLUMN api_keys.last_used_at IS 'When this API key was last used for authentication.';
COMMENT ON COLUMN api_keys.revoked_at IS 'When this API key was revoked; revoked keys cannot authenticate.';
COMMENT ON COLUMN api_keys.expires_at IS 'Authentication deadline; NULL means no expiry for non-administrator owners.';
COMMENT ON COLUMN api_keys.replaced_by_api_key_id IS 'Replacement key created by owner rotation; the old key has at most 24 hours of overlap.';
COMMENT ON COLUMN api_keys.expiry_reminder_sent_at IS 'Durable claim before expiry reminder delivery; retries never send twice.';

-- Current indexes for fresh schema bootstrap.
CREATE INDEX IF NOT EXISTS idx_api_keys__user_id__fk
  ON api_keys (user_id)
  WHERE user_id IS NOT NULL;
