-- edited-in-place: pre-launch, never deployed to production
-- Shared browser/native OAuth authorization broker for Facebook, X, and GitHub.

-- This table was not deployed by an earlier migration. A branch-local database that ran the
-- pre-launch 0582 draft must be rebuilt rather than silently retaining that superseded schema.
CREATE TABLE oauth_authorizations (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  provider TEXT NOT NULL CHECK (provider IN ('facebook', 'x', 'github')),
  purpose TEXT NOT NULL CHECK (purpose IN ('authenticate', 'connect')),
  callback_mode TEXT NOT NULL CHECK (callback_mode IN ('web', 'native')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (
    status IN (
      'pending',
      'callback_received',
      'exchanging',
      'completion_ready',
      'completed',
      'rejected',
      'expired'
    )
  ),
  initiating_user_id UUID REFERENCES users ON DELETE CASCADE,
  initiating_device_id UUID NOT NULL,
  initiating_session_id UUID NOT NULL,
  redirect_uri TEXT NOT NULL CHECK (char_length(redirect_uri) BETWEEN 1 AND 2048),
  state_hash TEXT NOT NULL CHECK (char_length(state_hash) = 64),
  pkce_verifier_ciphertext TEXT NOT NULL,
  completion_proof_challenge TEXT,
  callback_code_ciphertext TEXT,
  callback_error TEXT,
  completion_token_hash TEXT,
  completion_token_ciphertext TEXT,
  facebook_user_id TEXT REFERENCES facebook_accounts(facebook_user_id) ON DELETE CASCADE,
  x_user_id TEXT REFERENCES x_accounts(x_user_id) ON DELETE CASCADE,
  github_user_id TEXT REFERENCES github_accounts(github_user_id) ON DELETE CASCADE,
  result_kind TEXT CHECK (result_kind IS NULL OR result_kind IN ('authenticated', 'mfa_required', 'connected')),
  result_user_id UUID REFERENCES users ON DELETE CASCADE,
  result_device_id UUID,
  result_session_id UUID,
  login_attempt_id UUID,
  exchange_claim_id UUID,
  exchange_attempts SMALLINT NOT NULL DEFAULT 0 CHECK (exchange_attempts >= 0),
  expires_at TIMESTAMPTZ NOT NULL,
  callback_received_at TIMESTAMPTZ,
  exchange_started_at TIMESTAMPTZ,
  completion_ready_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (
    (purpose = 'authenticate' AND initiating_user_id IS NULL)
    OR (purpose = 'connect' AND initiating_user_id IS NOT NULL)
  ),
  CHECK (
    (callback_mode = 'native' AND completion_proof_challenge ~ '^[A-Za-z0-9_-]{43}$')
    OR (callback_mode = 'web' AND completion_proof_challenge IS NULL)
  ),
  CHECK (num_nonnulls(facebook_user_id, x_user_id, github_user_id) <= 1),
  CHECK (
    (provider = 'facebook' AND x_user_id IS NULL AND github_user_id IS NULL)
    OR (provider = 'x' AND facebook_user_id IS NULL AND github_user_id IS NULL)
    OR (provider = 'github' AND facebook_user_id IS NULL AND x_user_id IS NULL)
  ),
  CHECK (
    status NOT IN ('callback_received', 'exchanging', 'completion_ready', 'completed')
    OR callback_received_at IS NOT NULL
  ),
  CHECK (
    status NOT IN ('completion_ready', 'completed')
    OR (
      completion_ready_at IS NOT NULL
      AND callback_code_ciphertext IS NULL
      AND num_nonnulls(facebook_user_id, x_user_id, github_user_id) = 1
    )
  ),
  CHECK (
    (
      status <> 'completed'
      AND completed_at IS NULL
      AND result_kind IS NULL
      AND result_user_id IS NULL
      AND result_device_id IS NULL
      AND result_session_id IS NULL
      AND login_attempt_id IS NULL
    )
    OR (
      status = 'completed'
      AND completed_at IS NOT NULL
      AND result_user_id IS NOT NULL
      AND (
        (
          result_kind = 'authenticated'
          AND result_device_id IS NOT NULL
          AND uuid_extract_version(result_device_id) = 7
          AND result_session_id IS NOT NULL
          AND uuid_extract_version(result_session_id) = 7
          AND login_attempt_id IS NULL
        )
        OR (
          result_kind = 'mfa_required'
          AND result_device_id IS NULL
          AND result_session_id IS NULL
          AND login_attempt_id IS NOT NULL
          AND uuid_extract_version(login_attempt_id) = 7
        )
        OR (
          result_kind = 'connected'
          AND result_device_id IS NULL
          AND result_session_id IS NULL
          AND login_attempt_id IS NULL
        )
      )
    )
  )
);

CREATE OR REPLACE TRIGGER trigger_oauth_authorizations_updated_at
BEFORE UPDATE ON oauth_authorizations
FOR EACH ROW
EXECUTE FUNCTION fn_update_updated_at();

CREATE INDEX IF NOT EXISTS idx_oauth_authorizations__recoverable
ON oauth_authorizations (status, expires_at, id)
WHERE status IN ('callback_received', 'exchanging');

CREATE UNIQUE INDEX IF NOT EXISTS idx_oauth_authorizations__state_hash
ON oauth_authorizations (state_hash);

CREATE INDEX IF NOT EXISTS idx_oauth_authorizations__expiry
ON oauth_authorizations (expires_at, id);

CREATE INDEX IF NOT EXISTS idx_oauth_authorizations__initiating_user
ON oauth_authorizations (initiating_user_id, id)
WHERE initiating_user_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_oauth_authorizations__active_web_authentication
ON oauth_authorizations (initiating_device_id, initiating_session_id)
WHERE callback_mode = 'web'
  AND purpose = 'authenticate'
  AND status IN ('pending', 'callback_received', 'exchanging', 'completion_ready');

CREATE INDEX IF NOT EXISTS idx_oauth_authorizations__facebook_user
ON oauth_authorizations (facebook_user_id)
WHERE facebook_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_oauth_authorizations__x_user
ON oauth_authorizations (x_user_id)
WHERE x_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_oauth_authorizations__github_user
ON oauth_authorizations (github_user_id)
WHERE github_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_oauth_authorizations__result_user
ON oauth_authorizations (result_user_id)
WHERE result_user_id IS NOT NULL;

COMMENT ON TABLE oauth_authorizations IS 'Durable server-begun OAuth state machine shared by web and native Facebook, X, and GitHub authentication and account connection.';
COMMENT ON COLUMN oauth_authorizations.provider IS 'Provider selected at begin time; callback and completion derive it only from this durable record.';
COMMENT ON COLUMN oauth_authorizations.purpose IS 'authenticate creates or resumes a Voucha session; connect links the provider account to the authenticated initiating user.';
COMMENT ON COLUMN oauth_authorizations.callback_mode IS 'web uses an HttpOnly completion cookie; native uses a bearer token plus the app-held proof verifier.';
COMMENT ON COLUMN oauth_authorizations.status IS 'Explicit lifecycle: pending, callback_received, exchanging, completion_ready, completed, rejected, or expired.';
COMMENT ON COLUMN oauth_authorizations.initiating_user_id IS 'Required owner for connect flows and NULL for authenticate flows.';
COMMENT ON COLUMN oauth_authorizations.initiating_device_id IS 'Device JWT identifier that must still match when completion is consumed.';
COMMENT ON COLUMN oauth_authorizations.initiating_session_id IS 'Session JWT identifier that must still match when completion is consumed.';
COMMENT ON COLUMN oauth_authorizations.redirect_uri IS 'Server-selected public provider callback URI; callers cannot supply or override it.';
COMMENT ON COLUMN oauth_authorizations.state_hash IS 'Purpose-bound HMAC-SHA256 of the provider state; plaintext state is returned once and never persisted.';
COMMENT ON COLUMN oauth_authorizations.pkce_verifier_ciphertext IS 'Authenticated ciphertext of the server-generated provider PKCE verifier.';
COMMENT ON COLUMN oauth_authorizations.completion_proof_challenge IS 'Native-only base64url SHA-256 challenge for the app-held completion verifier.';
COMMENT ON COLUMN oauth_authorizations.callback_code_ciphertext IS 'Authenticated ciphertext of the one-time provider code; cleared only after durable provider-account persistence.';
COMMENT ON COLUMN oauth_authorizations.callback_error IS 'Bounded provider callback or terminal exchange error code; never contains provider credentials.';
COMMENT ON COLUMN oauth_authorizations.completion_token_hash IS 'Purpose-bound HMAC-SHA256 of the web cookie or native callback bearer token.';
COMMENT ON COLUMN oauth_authorizations.completion_token_ciphertext IS 'Authenticated ciphertext of the completion token retained only so a repeated provider callback converges on the same handoff.';
COMMENT ON COLUMN oauth_authorizations.facebook_user_id IS 'Facebook account produced by a successful exchange; parent deletion cascades the authorization.';
COMMENT ON COLUMN oauth_authorizations.x_user_id IS 'X account produced by a successful exchange; parent deletion cascades the authorization.';
COMMENT ON COLUMN oauth_authorizations.github_user_id IS 'GitHub account produced by a successful exchange; parent deletion cascades the authorization.';
COMMENT ON COLUMN oauth_authorizations.result_kind IS 'Durable completion outcome: authenticated, MFA required, or connected.';
COMMENT ON COLUMN oauth_authorizations.result_user_id IS 'Voucha user receiving the completion result; parent deletion cascades the authorization.';
COMMENT ON COLUMN oauth_authorizations.result_device_id IS 'Authenticated result device UUIDv7 allocated while the completion row is locked and reused by every issuance or replay.';
COMMENT ON COLUMN oauth_authorizations.result_session_id IS 'Authenticated result session UUIDv7 allocated while the completion row is locked and reused by every issuance or replay.';
COMMENT ON COLUMN oauth_authorizations.login_attempt_id IS 'UUIDv7 MFA attempt identifier returned only for an mfa_required result.';
COMMENT ON COLUMN oauth_authorizations.exchange_claim_id IS 'Fencing token for one worker exchange attempt; atomic provider-account completion must present the current claim.';
COMMENT ON COLUMN oauth_authorizations.exchange_attempts IS 'Durable count of claimed provider exchange attempts for reconciliation and operator diagnosis.';
COMMENT ON COLUMN oauth_authorizations.expires_at IS 'Authorization deadline; cleanup and recovery use this timestamp rather than UUID ordering.';
COMMENT ON COLUMN oauth_authorizations.callback_received_at IS 'When the provider callback first durably persisted a code or denial.';
COMMENT ON COLUMN oauth_authorizations.exchange_started_at IS 'When the current fenced provider exchange claim began.';
COMMENT ON COLUMN oauth_authorizations.completion_ready_at IS 'When provider identity persistence completed and the result became consumable.';
COMMENT ON COLUMN oauth_authorizations.completed_at IS 'When a caller first consumed and finalized the durable completion result.';
