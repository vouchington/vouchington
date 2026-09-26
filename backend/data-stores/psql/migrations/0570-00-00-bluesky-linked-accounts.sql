-- edited-in-place: pre-launch, never deployed to production
-- Bluesky OAuth lifecycle. Authorizations are durable state-machine records; account credentials
-- and native completions reference one exact authorization generation. UUIDs are identifiers only:
-- lifecycle ordering and expiry use explicit status and timestamp columns.

CREATE TABLE IF NOT EXISTS bluesky_link_authorizations (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  user_id UUID NOT NULL REFERENCES users ON DELETE CASCADE,
  handle TEXT CHECK (handle IS NULL OR (char_length(handle) > 0 AND char_length(handle) <= 253)),
  callback_mode TEXT NOT NULL CHECK (callback_mode IN ('web', 'native')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'callback_claimed', 'handoff_ready', 'attached', 'revoked', 'expired', 'rejected')
  ),
  completion_proof_challenge TEXT,
  claimed_did TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (
    (callback_mode = 'native' AND completion_proof_challenge ~ '^[A-Za-z0-9_-]{43}$')
    OR (callback_mode = 'web' AND completion_proof_challenge IS NULL)
  ),
  CHECK (claimed_did IS NULL OR (claimed_did LIKE 'did:%' AND char_length(claimed_did) <= 2048)),
  CHECK (status <> 'pending' OR claimed_did IS NULL),
  CHECK (
    (status IN ('revoked', 'expired', 'rejected') AND handle IS NULL)
    OR (status NOT IN ('revoked', 'expired', 'rejected') AND handle IS NOT NULL)
  ),
  CHECK (status NOT IN ('callback_claimed', 'handoff_ready', 'attached', 'revoked') OR claimed_did IS NOT NULL)
);

CREATE OR REPLACE TRIGGER trigger_bluesky_link_authorizations_updated_at
BEFORE UPDATE ON bluesky_link_authorizations
FOR EACH ROW
EXECUTE FUNCTION fn_update_updated_at();

CREATE INDEX IF NOT EXISTS idx_bluesky_link_authorizations__user_id
ON bluesky_link_authorizations (user_id);

CREATE INDEX IF NOT EXISTS idx_bluesky_link_authorizations__expiry
ON bluesky_link_authorizations (expires_at, id)
WHERE status IN ('pending', 'callback_claimed', 'handoff_ready');

CREATE INDEX IF NOT EXISTS idx_bluesky_link_authorizations__claimed_did
ON bluesky_link_authorizations (claimed_did)
WHERE claimed_did IS NOT NULL;

COMMENT ON TABLE bluesky_link_authorizations IS 'Durable Bluesky OAuth link state machine. UUIDs identify generations but are never compared for lifecycle causality; status transitions and timestamp expiry are authoritative.';
COMMENT ON COLUMN bluesky_link_authorizations.user_id IS 'Voucha user who authenticated the begin request and exclusively owns this authorization lifecycle.';
COMMENT ON COLUMN bluesky_link_authorizations.handle IS 'Handle supplied when authorization began; display-only because Bluesky DIDs are authoritative, and scrubbed when the authorization becomes terminal.';
COMMENT ON COLUMN bluesky_link_authorizations.callback_mode IS 'web for cookie-bound browser attachment; native for proof-bound custom-scheme completion.';
COMMENT ON COLUMN bluesky_link_authorizations.status IS 'Explicit lifecycle: pending, callback_claimed, handoff_ready, attached, revoked, expired, or rejected.';
COMMENT ON COLUMN bluesky_link_authorizations.completion_proof_challenge IS 'Native-only base64url SHA-256 challenge. The app retains the verifier; an intercepted custom-scheme bearer token is insufficient to attach.';
COMMENT ON COLUMN bluesky_link_authorizations.claimed_did IS 'DID exclusively claimed by the first successful provider callback for this authorization.';
COMMENT ON COLUMN bluesky_link_authorizations.expires_at IS 'Authorization deadline. Cleanup uses this timestamp and status, never UUID ordering.';

CREATE TABLE IF NOT EXISTS bluesky_linked_accounts (
  bluesky_did TEXT PRIMARY KEY,
  CHECK (bluesky_did LIKE 'did:%' AND char_length(bluesky_did) <= 2048),
  user_id UUID REFERENCES users ON DELETE CASCADE,
  handle TEXT,
  CHECK (handle IS NULL OR (char_length(handle) > 0 AND char_length(handle) <= 253)),
  link_authorization_id UUID NOT NULL REFERENCES bluesky_link_authorizations ON DELETE RESTRICT,
  session_ciphertext TEXT NOT NULL,
  disconnect_requested_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (bluesky_did, link_authorization_id)
);

CREATE OR REPLACE TRIGGER trigger_bluesky_linked_accounts_updated_at
BEFORE UPDATE ON bluesky_linked_accounts
FOR EACH ROW
EXECUTE FUNCTION fn_update_updated_at();

CREATE UNIQUE INDEX IF NOT EXISTS idx_bluesky_linked_accounts__user_id
ON bluesky_linked_accounts (user_id) WHERE user_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_bluesky_linked_accounts__link_authorization_id
ON bluesky_linked_accounts (link_authorization_id);

CREATE INDEX IF NOT EXISTS idx_bluesky_linked_accounts__pending_disconnect
ON bluesky_linked_accounts (disconnect_requested_at, link_authorization_id)
WHERE disconnect_requested_at IS NOT NULL;

COMMENT ON TABLE bluesky_linked_accounts IS 'Encrypted Bluesky OAuth sessions. Each row belongs to one exact durable link authorization generation and is deleted when that generation is retired.';
COMMENT ON COLUMN bluesky_linked_accounts.bluesky_did IS 'Permanent AT Protocol account DID; handles are mutable display data.';
COMMENT ON COLUMN bluesky_linked_accounts.user_id IS 'Attached Voucha user. NULL only while the referenced authorization is callback_claimed or handoff_ready.';
COMMENT ON COLUMN bluesky_linked_accounts.handle IS 'Cached display handle, populated on attachment.';
COMMENT ON COLUMN bluesky_linked_accounts.link_authorization_id IS 'Exact authorization generation owning this credential. Lifecycle state lives in bluesky_link_authorizations.';
COMMENT ON COLUMN bluesky_linked_accounts.session_ciphertext IS 'AES-256-GCM ciphertext of the SDK session using purpose bluesky:session:<bluesky_did>. Every mutation validates exact authorization status and owner.';
COMMENT ON COLUMN bluesky_linked_accounts.disconnect_requested_at IS 'Durable unlink intent. Requested rows are hidden immediately and replayed by bluesky-follow-propagation until the exact credential generation is revoked.';

CREATE TABLE IF NOT EXISTS bluesky_link_completions (
  authorization_id UUID PRIMARY KEY REFERENCES bluesky_link_authorizations ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users ON DELETE CASCADE,
  bluesky_did TEXT NOT NULL,
  handle TEXT NOT NULL CHECK (char_length(handle) > 0 AND char_length(handle) <= 253),
  token_hash TEXT NOT NULL CHECK (char_length(token_hash) = 64),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (bluesky_did, authorization_id)
    REFERENCES bluesky_linked_accounts (bluesky_did, link_authorization_id) ON DELETE CASCADE
);

CREATE OR REPLACE TRIGGER trigger_bluesky_link_completions_updated_at
BEFORE UPDATE ON bluesky_link_completions
FOR EACH ROW
EXECUTE FUNCTION fn_update_updated_at();

CREATE INDEX IF NOT EXISTS idx_bluesky_link_completions__expiry
ON bluesky_link_completions (expires_at, authorization_id);

CREATE INDEX IF NOT EXISTS idx_bluesky_link_completions__user_id
ON bluesky_link_completions (user_id);

CREATE INDEX IF NOT EXISTS idx_bluesky_link_completions__account
ON bluesky_link_completions (bluesky_did, authorization_id);

COMMENT ON TABLE bluesky_link_completions IS 'Short-lived one-time native handoffs for an exact handoff_ready authorization. Bearer token plus the app-held proof verifier are required.';
COMMENT ON COLUMN bluesky_link_completions.authorization_id IS 'Exact native authorization and account generation consumed at most once.';
COMMENT ON COLUMN bluesky_link_completions.user_id IS 'Authenticated initiating Voucha user; portable callback URLs cannot transfer ownership.';
COMMENT ON COLUMN bluesky_link_completions.bluesky_did IS 'DID claimed by the matching authorization callback.';
COMMENT ON COLUMN bluesky_link_completions.handle IS 'Display handle captured at authorization begin.';
COMMENT ON COLUMN bluesky_link_completions.token_hash IS 'Purpose-bound HMAC-SHA256 of the custom-scheme bearer token; plaintext is never persisted.';
COMMENT ON COLUMN bluesky_link_completions.expires_at IS 'Handoff deadline checked independently from the parent authorization deadline.';
