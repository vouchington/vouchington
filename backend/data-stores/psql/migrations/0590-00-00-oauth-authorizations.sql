-- edited-in-place: pre-launch, never deployed to production
-- Shared browser/native OAuth authorization broker for Facebook, X, GitHub, LinkedIn, Microsoft, and Google.

-- This table was not deployed by an earlier migration. A branch-local database that ran the
-- pre-launch 0582 draft must be rebuilt rather than silently retaining that superseded schema.
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TABLE oauth_authorizations (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  provider oauth_authorization_providers NOT NULL CHECK (provider IN ('facebook', 'x', 'github', 'linkedin', 'microsoft', 'google')),
  purpose oauth_authorization_purposes NOT NULL CHECK (purpose IN ('authenticate', 'connect', 're_auth')),
  callback_mode oauth_callback_modes NOT NULL CHECK (callback_mode IN ('web', 'native')),
  status oauth_authorization_statuses GENERATED ALWAYS AS (
    CASE
      WHEN completed_at IS NOT NULL THEN 'completed'::oauth_authorization_statuses
      WHEN rejected_at IS NOT NULL THEN 'rejected'::oauth_authorization_statuses
      WHEN expired_at IS NOT NULL THEN 'expired'::oauth_authorization_statuses
      WHEN completion_ready_at IS NOT NULL THEN 'completion_ready'::oauth_authorization_statuses
      WHEN callback_received_at IS NOT NULL THEN 'callback_received'::oauth_authorization_statuses
      ELSE 'pending'::oauth_authorization_statuses
    END
  ) STORED NOT NULL,
  initiating_user_id UUID REFERENCES users ON DELETE CASCADE,
  initiating_device_id UUID NOT NULL,
  initiating_session_id UUID NOT NULL,
  redirect_uri TEXT NOT NULL CHECK (char_length(redirect_uri) BETWEEN 1 AND 2048),
  state_hash TEXT NOT NULL CHECK (char_length(state_hash) = 64),
  pkce_verifier_ciphertext TEXT NOT NULL,
  completion_proof_challenge TEXT,
  callback_code_ciphertext TEXT,
  callback_code_hash TEXT CHECK (callback_code_hash IS NULL OR char_length(callback_code_hash) = 64),
  callback_error TEXT,
  callback_error_hash TEXT CHECK (callback_error_hash IS NULL OR char_length(callback_error_hash) = 64),
  completion_token_hash TEXT,
  completion_token_ciphertext TEXT,
  facebook_account_id UUID REFERENCES facebook_accounts(id) ON DELETE CASCADE,
  x_account_id UUID REFERENCES x_accounts(id) ON DELETE CASCADE,
  github_account_id UUID REFERENCES github_accounts(id) ON DELETE CASCADE,
  linkedin_account_id UUID,
  microsoft_account_id UUID,
  google_account_id UUID,
  result_kind oauth_authorization_result_kinds CHECK (result_kind IS NULL OR result_kind IN ('authenticated', 'mfa_required', 'connected')),
  result_user_id UUID REFERENCES users ON DELETE CASCADE,
  result_device_id UUID,
  result_session_id UUID,
  login_attempt_id UUID,
  exchange_claim_id UUID,
  expires_at TIMESTAMPTZ NOT NULL,
  callback_received_at TIMESTAMPTZ,
  exchange_started_at TIMESTAMPTZ,
  completion_ready_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  rejected_at TIMESTAMPTZ,
  expired_at TIMESTAMPTZ,
  CHECK (num_nonnulls(completed_at, rejected_at, expired_at) <= 1),
  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (
    (purpose = 'authenticate' AND initiating_user_id IS NULL)
    OR (purpose IN ('connect', 're_auth') AND initiating_user_id IS NOT NULL)
  ),
  CHECK (
    (callback_mode = 'native' AND completion_proof_challenge ~ '^[A-Za-z0-9_-]{43}$')
    OR (callback_mode = 'web' AND completion_proof_challenge IS NULL)
  ),
  CHECK (num_nonnulls(facebook_account_id, x_account_id, github_account_id, linkedin_account_id, microsoft_account_id, google_account_id) <= 1),
  CHECK (
    (provider = 'facebook' AND x_account_id IS NULL AND github_account_id IS NULL AND linkedin_account_id IS NULL AND microsoft_account_id IS NULL AND google_account_id IS NULL)
    OR (provider = 'x' AND facebook_account_id IS NULL AND github_account_id IS NULL AND linkedin_account_id IS NULL AND microsoft_account_id IS NULL AND google_account_id IS NULL)
    OR (provider = 'github' AND facebook_account_id IS NULL AND x_account_id IS NULL AND linkedin_account_id IS NULL AND microsoft_account_id IS NULL AND google_account_id IS NULL)
    OR (provider = 'linkedin' AND facebook_account_id IS NULL AND x_account_id IS NULL AND github_account_id IS NULL AND microsoft_account_id IS NULL AND google_account_id IS NULL)
    OR (provider = 'microsoft' AND facebook_account_id IS NULL AND x_account_id IS NULL AND github_account_id IS NULL AND linkedin_account_id IS NULL AND google_account_id IS NULL)
    OR (provider = 'google' AND facebook_account_id IS NULL AND x_account_id IS NULL AND github_account_id IS NULL AND linkedin_account_id IS NULL AND microsoft_account_id IS NULL)
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
      AND num_nonnulls(facebook_account_id, x_account_id, github_account_id, linkedin_account_id, microsoft_account_id, google_account_id) = 1
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

ALTER TABLE oauth_authorizations
  ADD CONSTRAINT oauth_authorizations_linkedin_account_id_fkey
  FOREIGN KEY (linkedin_account_id) REFERENCES linkedin_accounts(id)
  ON DELETE CASCADE NOT VALID;

ALTER TABLE oauth_authorizations
  VALIDATE CONSTRAINT oauth_authorizations_linkedin_account_id_fkey;

ALTER TABLE oauth_authorizations
  ADD CONSTRAINT oauth_authorizations_microsoft_account_id_fkey
  FOREIGN KEY (microsoft_account_id) REFERENCES microsoft_accounts(id) ON DELETE CASCADE
  NOT VALID;
ALTER TABLE oauth_authorizations
  VALIDATE CONSTRAINT oauth_authorizations_microsoft_account_id_fkey;

ALTER TABLE oauth_authorizations
  ADD CONSTRAINT oauth_authorizations_google_account_id_fkey
  FOREIGN KEY (google_account_id) REFERENCES google_accounts(id) ON DELETE CASCADE NOT VALID;
ALTER TABLE oauth_authorizations
  VALIDATE CONSTRAINT oauth_authorizations_google_account_id_fkey;

CREATE OR REPLACE TRIGGER trigger_oauth_authorizations_updated_at
BEFORE UPDATE ON oauth_authorizations
FOR EACH ROW
EXECUTE FUNCTION fn_update_updated_at();

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX IF NOT EXISTS idx_oauth_authorizations__recoverable
ON oauth_authorizations (status, expires_at, id)
WHERE status = 'callback_received';

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

CREATE INDEX IF NOT EXISTS idx_oauth_authorizations__facebook_account
ON oauth_authorizations (facebook_account_id)
WHERE facebook_account_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_oauth_authorizations__x_account
ON oauth_authorizations (x_account_id)
WHERE x_account_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_oauth_authorizations__github_account
ON oauth_authorizations (github_account_id)
WHERE github_account_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_oauth_authorizations__linkedin_account
ON oauth_authorizations (linkedin_account_id)
WHERE linkedin_account_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_oauth_authorizations__microsoft_account
ON oauth_authorizations (microsoft_account_id)
WHERE microsoft_account_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_oauth_authorizations__google_account
ON oauth_authorizations (google_account_id)
WHERE google_account_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_oauth_authorizations__result_user
ON oauth_authorizations (result_user_id)
WHERE result_user_id IS NOT NULL;

COMMENT ON TABLE oauth_authorizations IS 'Durable server-begun OAuth state machine shared by web and native Facebook, X, GitHub, LinkedIn, Microsoft, and Google authentication and account connection.';
COMMENT ON COLUMN oauth_authorizations.provider IS 'Provider selected at begin time; callback and completion derive it only from this durable record.';
COMMENT ON COLUMN oauth_authorizations.purpose IS 'authenticate creates or resumes a Voucha session; connect links an account; re_auth verifies an already-linked provider without linking or creating a session.';
COMMENT ON COLUMN oauth_authorizations.callback_mode IS 'web uses an HttpOnly completion cookie; native uses a bearer token plus the app-held proof verifier.';
COMMENT ON COLUMN oauth_authorizations.status IS 'Lifecycle derived from callback, handoff, consumption, rejection and expiry timestamps; current exchange activity is projected from immutable attempts.';
COMMENT ON COLUMN oauth_authorizations.initiating_user_id IS 'Required owner for connect and re_auth flows; NULL for authenticate flows.';
COMMENT ON COLUMN oauth_authorizations.initiating_device_id IS 'Device JWT identifier that must still match when completion is consumed.';
COMMENT ON COLUMN oauth_authorizations.initiating_session_id IS 'Session JWT identifier that must still match when completion is consumed.';
COMMENT ON COLUMN oauth_authorizations.redirect_uri IS 'Server-selected public provider callback URI; callers cannot supply or override it.';
COMMENT ON COLUMN oauth_authorizations.state_hash IS 'Purpose-bound HMAC-SHA256 of the provider state; plaintext state is returned once and never persisted.';
COMMENT ON COLUMN oauth_authorizations.pkce_verifier_ciphertext IS 'Authenticated ciphertext of the server-generated provider PKCE verifier.';
COMMENT ON COLUMN oauth_authorizations.completion_proof_challenge IS 'Native-only base64url SHA-256 challenge for the app-held completion verifier.';
COMMENT ON COLUMN oauth_authorizations.callback_code_ciphertext IS 'Authenticated ciphertext of the one-time provider code; cleared only after durable provider-account persistence.';
COMMENT ON COLUMN oauth_authorizations.callback_code_hash IS 'Purpose-bound HMAC-SHA256 of the original provider code; retained for exact callback replay after code ciphertext is cleared.';
COMMENT ON COLUMN oauth_authorizations.callback_error IS 'Bounded provider callback or terminal exchange error code; never contains provider credentials.';
COMMENT ON COLUMN oauth_authorizations.callback_error_hash IS 'Purpose-bound HMAC-SHA256 of the original unnormalized provider callback error for exact replay.';
COMMENT ON COLUMN oauth_authorizations.completion_token_hash IS 'Purpose-bound HMAC-SHA256 of the web cookie or native callback bearer token.';
COMMENT ON COLUMN oauth_authorizations.completion_token_ciphertext IS 'Authenticated ciphertext of the completion token retained only so a repeated provider callback converges on the same handoff.';
COMMENT ON COLUMN oauth_authorizations.facebook_account_id IS 'Facebook account produced by a successful exchange; parent deletion cascades the authorization.';
COMMENT ON COLUMN oauth_authorizations.x_account_id IS 'X account produced by a successful exchange; parent deletion cascades the authorization.';
COMMENT ON COLUMN oauth_authorizations.github_account_id IS 'GitHub account produced by a successful exchange; parent deletion cascades the authorization.';
COMMENT ON COLUMN oauth_authorizations.linkedin_account_id IS 'Internal LinkedIn account row produced by a successful exchange; parent deletion cascades the authorization.';
COMMENT ON COLUMN oauth_authorizations.microsoft_account_id IS 'Internal Microsoft account row produced by a successful exchange; parent deletion cascades the authorization.';
COMMENT ON COLUMN oauth_authorizations.google_account_id IS 'Internal Google account row produced by a successful exchange; parent deletion cascades the authorization.';
COMMENT ON COLUMN oauth_authorizations.result_kind IS 'Durable completion outcome: authenticated, MFA required, or connected.';
COMMENT ON COLUMN oauth_authorizations.result_user_id IS 'Voucha user receiving the completion result; parent deletion cascades the authorization.';
COMMENT ON COLUMN oauth_authorizations.result_device_id IS 'Authenticated result device UUIDv7 allocated while the completion row is locked and reused by every issuance or replay.';
COMMENT ON COLUMN oauth_authorizations.result_session_id IS 'Authenticated result session UUIDv7 allocated while the completion row is locked and reused by every issuance or replay.';
COMMENT ON COLUMN oauth_authorizations.login_attempt_id IS 'UUIDv7 MFA attempt identifier returned only for an mfa_required result.';
COMMENT ON COLUMN oauth_authorizations.exchange_claim_id IS 'Fencing token for one worker exchange attempt; atomic provider-account completion must present the current claim.';
COMMENT ON COLUMN oauth_authorizations.expires_at IS 'Authorization deadline; cleanup and recovery use this timestamp rather than UUID ordering.';
COMMENT ON COLUMN oauth_authorizations.callback_received_at IS 'When the provider callback first durably persisted a code or denial.';
COMMENT ON COLUMN oauth_authorizations.exchange_started_at IS 'When the first provider exchange began; current attempt age belongs to the exchange attempt ledger.';
COMMENT ON COLUMN oauth_authorizations.completion_ready_at IS 'When provider identity persistence completed and the result became consumable.';
COMMENT ON COLUMN oauth_authorizations.completed_at IS 'When a caller first consumed and finalized the durable completion result.';

COMMENT ON COLUMN oauth_authorizations.rejected_at IS 'When callback denial or terminal provider exchange failure rejected this authorization.';
COMMENT ON COLUMN oauth_authorizations.expired_at IS 'When the unconsumed authorization deadline was enforced.';

CREATE TABLE oauth_authorization_exchange_attempts (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  oauth_authorization_id UUID NOT NULL REFERENCES oauth_authorizations ON DELETE CASCADE,
  attempt_number SMALLINT NOT NULL CHECK (attempt_number BETWEEN 1 AND 5),
  exchange_claim_id UUID NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  UNIQUE (oauth_authorization_id, attempt_number),
  UNIQUE (oauth_authorization_id, exchange_claim_id)
);
CREATE TRIGGER trigger_oauth_authorization_exchange_attempts_immutable
BEFORE UPDATE OR DELETE ON oauth_authorization_exchange_attempts
FOR EACH ROW EXECUTE FUNCTION fn_reject_mutation();
COMMENT ON TABLE oauth_authorization_exchange_attempts IS 'Immutable numbered provider exchanges, retained with their authorization; deletion follows authorization retention.';
COMMENT ON COLUMN oauth_authorization_exchange_attempts.id IS 'UUIDv7 identity of this exchange attempt.';
COMMENT ON COLUMN oauth_authorization_exchange_attempts.oauth_authorization_id IS 'Authorization whose row lock serializes attempt numbering.';
COMMENT ON COLUMN oauth_authorization_exchange_attempts.attempt_number IS 'Monotone bounded provider exchange ordinal, never reset after a failed attempt.';
COMMENT ON COLUMN oauth_authorization_exchange_attempts.exchange_claim_id IS 'One-shot callback exchange CAS identity; not a general work lease.';
COMMENT ON COLUMN oauth_authorization_exchange_attempts.created_at IS 'UUIDv7-derived insertion time of this immutable exchange attempt.';
COMMENT ON COLUMN oauth_authorization_exchange_attempts.started_at IS 'When this attempt began; recovery uses this timestamp for stale claims.';

CREATE TABLE oauth_authorization_exchange_attempt_results (
  oauth_authorization_exchange_attempt_id UUID PRIMARY KEY REFERENCES oauth_authorization_exchange_attempts ON DELETE CASCADE,
  completed_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  abandoned_at TIMESTAMPTZ,
  rejected_at TIMESTAMPTZ,
  expired_at TIMESTAMPTZ,
  callback_error TEXT,
  CHECK (num_nonnulls(completed_at, failed_at, abandoned_at, rejected_at, expired_at) = 1)
);
CREATE TRIGGER trigger_oauth_exchange_attempt_results_immutable
BEFORE UPDATE OR DELETE ON oauth_authorization_exchange_attempt_results
FOR EACH ROW EXECUTE FUNCTION fn_reject_mutation();
COMMENT ON TABLE oauth_authorization_exchange_attempt_results IS 'Immutable final exchange outcomes, including retryable failure and superseded claims; deleted only with retained authorization history.';
COMMENT ON COLUMN oauth_authorization_exchange_attempt_results.oauth_authorization_exchange_attempt_id IS 'Exchange attempt finalized exactly once.';
COMMENT ON COLUMN oauth_authorization_exchange_attempt_results.completed_at IS 'When the provider identity became ready for caller completion.';
COMMENT ON COLUMN oauth_authorization_exchange_attempt_results.failed_at IS 'When the attempt released its claim for another bounded retry.';
COMMENT ON COLUMN oauth_authorization_exchange_attempt_results.abandoned_at IS 'When a successor superseded this stale attempt.';
COMMENT ON COLUMN oauth_authorization_exchange_attempt_results.rejected_at IS 'When terminal exchange failure rejected the authorization.';
COMMENT ON COLUMN oauth_authorization_exchange_attempt_results.expired_at IS 'When expiry ended this exchange.';
COMMENT ON COLUMN oauth_authorization_exchange_attempt_results.callback_error IS 'Credential-free callback or exchange error at finalization.';

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE FUNCTION fn_create_oauth_authorization_exchange_transition()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.exchange_claim_id IS NOT DISTINCT FROM NEW.exchange_claim_id THEN
    RETURN NEW;
  END IF;
  IF OLD.exchange_claim_id IS NOT NULL THEN
    INSERT INTO oauth_authorization_exchange_attempt_results (
      oauth_authorization_exchange_attempt_id, completed_at, failed_at,
      abandoned_at, rejected_at, expired_at, callback_error
    )
    SELECT id,
      CASE WHEN NEW.completion_ready_at IS NOT NULL AND NEW.rejected_at IS NULL
        AND NEW.expired_at IS NULL THEN clock_timestamp() END,
      CASE WHEN NEW.exchange_claim_id IS NULL AND NEW.completion_ready_at IS NULL
        AND NEW.rejected_at IS NULL AND NEW.expired_at IS NULL THEN clock_timestamp() END,
      CASE WHEN NEW.exchange_claim_id IS NOT NULL THEN clock_timestamp() END,
      CASE WHEN NEW.rejected_at IS NOT NULL THEN NEW.rejected_at END,
      CASE WHEN NEW.expired_at IS NOT NULL THEN NEW.expired_at END,
      NEW.callback_error
    FROM oauth_authorization_exchange_attempts
    WHERE oauth_authorization_id = NEW.id AND exchange_claim_id = OLD.exchange_claim_id;
  END IF;
  IF NEW.exchange_claim_id IS NOT NULL THEN
    INSERT INTO oauth_authorization_exchange_attempts (
      oauth_authorization_id, attempt_number, exchange_claim_id
    )
    SELECT NEW.id, COALESCE(MAX(attempt_number), 0) + 1, NEW.exchange_claim_id
    FROM oauth_authorization_exchange_attempts WHERE oauth_authorization_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trigger_oauth_authorizations_exchange_history
AFTER UPDATE OF exchange_claim_id ON oauth_authorizations
FOR EACH ROW EXECUTE FUNCTION fn_create_oauth_authorization_exchange_transition();
COMMENT ON FUNCTION fn_create_oauth_authorization_exchange_transition() IS 'Atomically finalizes a released or superseded exchange and appends its successor while the authorization row remains locked.';
