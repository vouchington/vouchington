-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE SEQUENCE IF NOT EXISTS oauth_client_metadata_refresh_generation_seq AS BIGINT;

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TABLE IF NOT EXISTS oauth_clients (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  metadata_url TEXT,
  metadata_refresh_generation BIGINT,
  metadata_refreshed_at TIMESTAMPTZ,
  metadata_expires_at TIMESTAMPTZ,
  verified_at TIMESTAMPTZ,
  verified_by_id UUID REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT oauth_clients_metadata_url_check CHECK (
    metadata_url IS NULL OR (
      char_length(metadata_url) <= 2048
      AND (
        metadata_url ~* '^https://[^/?#@[:space:][:cntrl:]]+/[^#[:space:][:cntrl:]]*$'
        OR metadata_url ~ '^http://(localhost|127\.0\.0\.1|\[::1\])(:[0-9]{1,5})?/api/v1/oauth/native-clients/(ios|macos|windows)$'
      )
      AND position(chr(92) IN metadata_url) = 0
      AND split_part(metadata_url, '?', 1) !~ '/\.\.?(/|$)'
    )
  ),
  CONSTRAINT oauth_clients_verified_by_id_check CHECK (verified_by_id IS NULL OR verified_at IS NOT NULL),
  client_id TEXT NOT NULL UNIQUE,
  owner_user_id UUID REFERENCES users ON DELETE SET NULL,
  client_name TEXT NOT NULL CHECK (char_length(client_name) BETWEEN 1 AND 120),
  client_type oauth_client_types NOT NULL CHECK (client_type IN ('public', 'confidential')),
  token_endpoint_auth_method oauth_client_token_endpoint_auth_methods NOT NULL CHECK (
    token_endpoint_auth_method IN ('none', 'client_secret_basic')
  ),
  redirect_uris TEXT[] NOT NULL CHECK (cardinality(redirect_uris) BETWEEN 1 AND 10),
  grant_types oauth_grant_types[] NOT NULL CHECK (
    grant_types @> ARRAY['authorization_code', 'refresh_token']::oauth_grant_types[]
  ),
  response_types oauth_response_types[] NOT NULL CHECK (cardinality(response_types) = 1),
  scopes api_scopes[] NOT NULL CHECK (cardinality(scopes) > 0),
  client_secret_hash TEXT CHECK (client_secret_hash IS NULL OR char_length(client_secret_hash) = 64),
  first_granted_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (
    (client_type = 'public' AND token_endpoint_auth_method = 'none' AND client_secret_hash IS NULL)
    OR (
      client_type = 'confidential'
      AND token_endpoint_auth_method = 'client_secret_basic'
      AND client_secret_hash IS NOT NULL
    )
  ),
  CHECK (
    (
      metadata_url IS NULL
      AND metadata_refresh_generation IS NULL
      AND metadata_refreshed_at IS NULL
      AND metadata_expires_at IS NULL
      AND client_id ~ '^voucha_[A-Za-z0-9_-]{32,}$'
    )
    OR (
      metadata_url IS NOT NULL
      AND client_id = metadata_url
      AND metadata_refresh_generation IS NOT NULL
      AND metadata_refreshed_at IS NOT NULL
      AND metadata_expires_at IS NOT NULL
      AND owner_user_id IS NULL
      AND client_type = 'public'
      AND token_endpoint_auth_method = 'none'
      AND client_secret_hash IS NULL
      AND verified_at IS NULL
      AND verified_by_id IS NULL
    )
  )
);

CREATE OR REPLACE TRIGGER trigger_oauth_clients_updated_at
BEFORE UPDATE ON oauth_clients
FOR EACH ROW
EXECUTE FUNCTION fn_update_updated_at();

CREATE INDEX IF NOT EXISTS idx_oauth_clients__owner
ON oauth_clients (owner_user_id, id)
WHERE owner_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_oauth_clients__verified_active_id
ON oauth_clients (id DESC)
WHERE metadata_url IS NULL AND revoked_at IS NULL AND verified_at IS NOT NULL;

-- Proposed default: only clients that never held a grant are purged after 90 days.
CREATE INDEX IF NOT EXISTS idx_oauth_clients__never_granted
ON oauth_clients (id) WHERE first_granted_at IS NULL;

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TABLE IF NOT EXISTS oauth_authorization_requests (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  client_id UUID NOT NULL REFERENCES oauth_clients ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users ON DELETE CASCADE,
  browser_binding_hash TEXT NOT NULL CHECK (char_length(browser_binding_hash) = 64),
  redirect_uri TEXT NOT NULL CHECK (char_length(redirect_uri) BETWEEN 1 AND 2048),
  client_state TEXT NOT NULL CHECK (char_length(client_state) BETWEEN 1 AND 1024),
  resource TEXT NOT NULL CHECK (char_length(resource) BETWEEN 1 AND 2048),
  scopes api_scopes[] NOT NULL CHECK (cardinality(scopes) > 0),
  code_challenge TEXT NOT NULL CHECK (code_challenge ~ '^[A-Za-z0-9_-]{43}$'),
  expires_at TIMESTAMPTZ NOT NULL,
  approved_at TIMESTAMPTZ,
  denied_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (num_nonnulls(approved_at, denied_at) <= 1)
);

CREATE OR REPLACE TRIGGER trigger_oauth_authorization_requests_updated_at
BEFORE UPDATE ON oauth_authorization_requests
FOR EACH ROW
EXECUTE FUNCTION fn_update_updated_at();

CREATE INDEX IF NOT EXISTS idx_oauth_authorization_requests__client
ON oauth_authorization_requests (client_id, id);

CREATE INDEX IF NOT EXISTS idx_oauth_authorization_requests__user
ON oauth_authorization_requests (user_id, id);

CREATE INDEX IF NOT EXISTS idx_oauth_authorization_requests__browser
ON oauth_authorization_requests (browser_binding_hash, client_id, id)
WHERE approved_at IS NULL AND denied_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_oauth_authorization_requests__expiry
ON oauth_authorization_requests (expires_at, id);

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
DO $$ BEGIN
  CREATE TYPE oauth_native_attestation_statuses AS ENUM ('attested', 'unattested');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS oauth_grant_retention_anchors (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES retained_user_identities (id) ON DELETE RESTRICT,
  ended_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_oauth_grant_retention_anchors__user
ON oauth_grant_retention_anchors (user_id);
CREATE INDEX IF NOT EXISTS idx_oauth_grant_retention_anchors__ended
ON oauth_grant_retention_anchors (ended_at, id) WHERE ended_at IS NOT NULL;

COMMENT ON TABLE oauth_grant_retention_anchors IS 'Non-authorizing identity and end clock for a grant whose consent evidence survives deletion of the live grant.';
COMMENT ON COLUMN oauth_grant_retention_anchors.user_id IS 'Retained owner identity; this row never grants access.';
COMMENT ON COLUMN oauth_grant_retention_anchors.ended_at IS 'Latest revoke or deletion time, from which the final consent-evidence window runs.';

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TABLE IF NOT EXISTS oauth_grants (
  id UUID PRIMARY KEY DEFAULT uuidv7() REFERENCES oauth_grant_retention_anchors (id) ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED,
  user_id UUID NOT NULL REFERENCES users ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES oauth_clients ON DELETE CASCADE,
  session_id UUID REFERENCES user_sessions(id) ON DELETE CASCADE,
  attestation_status oauth_native_attestation_statuses,
  resource TEXT NOT NULL CHECK (char_length(resource) BETWEEN 1 AND 2048),
  scopes api_scopes[] NOT NULL CHECK (cardinality(scopes) > 0),
  consented_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK ((session_id IS NULL) = (attestation_status IS NULL))
);

CREATE OR REPLACE FUNCTION fn_register_oauth_grant_retention_anchor()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO oauth_grant_retention_anchors (id, user_id) VALUES (NEW.id, NEW.user_id);
  RETURN NEW;
END;
$$;
CREATE OR REPLACE TRIGGER trigger_oauth_grants_register_retention_anchor
AFTER INSERT ON oauth_grants
FOR EACH ROW EXECUTE FUNCTION fn_register_oauth_grant_retention_anchor();
COMMENT ON FUNCTION fn_register_oauth_grant_retention_anchor() IS 'Registers a non-authorizing grant identity only for an inserted grant; the deferred live grant FK is checked at commit.';

CREATE OR REPLACE FUNCTION fn_update_oauth_grant_retention_anchor()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    UPDATE oauth_grant_retention_anchors
    SET ended_at = GREATEST(COALESCE(ended_at, '-infinity'::timestamptz), CURRENT_TIMESTAMP)
    WHERE id = OLD.id;
    RETURN OLD;
  END IF;
  UPDATE oauth_grant_retention_anchors
  SET ended_at = GREATEST(COALESCE(ended_at, '-infinity'::timestamptz), NEW.revoked_at)
  WHERE id = OLD.id;
  RETURN NEW;
END;
$$;
CREATE OR REPLACE TRIGGER trigger_oauth_grants_end_retention_on_revoke
AFTER UPDATE OF revoked_at ON oauth_grants
FOR EACH ROW WHEN (NEW.revoked_at IS NOT NULL AND OLD.revoked_at IS DISTINCT FROM NEW.revoked_at)
EXECUTE FUNCTION fn_update_oauth_grant_retention_anchor();
CREATE OR REPLACE TRIGGER trigger_oauth_grants_end_retention_on_delete
BEFORE DELETE ON oauth_grants
FOR EACH ROW EXECUTE FUNCTION fn_update_oauth_grant_retention_anchor();
COMMENT ON FUNCTION fn_update_oauth_grant_retention_anchor() IS 'Moves the consent-evidence retention anchor to the latest grant revocation or deletion time.';

CREATE OR REPLACE TRIGGER trigger_oauth_grants_updated_at
BEFORE UPDATE ON oauth_grants
FOR EACH ROW
EXECUTE FUNCTION fn_update_updated_at();

CREATE OR REPLACE FUNCTION fn_update_oauth_client_first_grant()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  UPDATE oauth_clients
  SET first_granted_at = COALESCE(first_granted_at, CURRENT_TIMESTAMP)
  WHERE id = NEW.client_id AND first_granted_at IS NULL;
  RETURN NEW;
END;
$$;
CREATE OR REPLACE TRIGGER trigger_oauth_grants_stamp_client
AFTER INSERT ON oauth_grants
FOR EACH ROW EXECUTE FUNCTION fn_update_oauth_client_first_grant();
COMMENT ON FUNCTION fn_update_oauth_client_first_grant() IS 'Permanently marks an OAuth client that has held a grant so client retention cannot treat it as unused.';

CREATE UNIQUE INDEX IF NOT EXISTS idx_oauth_grants__active_subject
ON oauth_grants (user_id, client_id, resource)
WHERE revoked_at IS NULL AND session_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_oauth_grants__native_session
ON oauth_grants (session_id)
WHERE session_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_oauth_grants__client
ON oauth_grants (client_id, id);

CREATE INDEX IF NOT EXISTS idx_oauth_grants__user
ON oauth_grants (user_id, id);

-- Proposed default: revoked grants are eligible after 90 days.
CREATE INDEX IF NOT EXISTS idx_oauth_grants__retention
ON oauth_grants (revoked_at, id) WHERE revoked_at IS NOT NULL;

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TABLE IF NOT EXISTS oauth_authorization_server_events (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  event_type oauth_authorization_server_event_types NOT NULL CHECK (event_type IN (
    'consent_approved',
    'consent_denied',
    'access_token_revoked',
    'refresh_family_revoked',
    'refresh_reuse_detected'
  )),
  authorization_request_id UUID,
  access_token_id UUID,
  refresh_token_family_id UUID,
  user_id UUID NOT NULL REFERENCES retained_user_identities (id) ON DELETE RESTRICT,
  client_id UUID NOT NULL,
  grant_id UUID REFERENCES oauth_grant_retention_anchors (id) ON DELETE RESTRICT,
  resource TEXT NOT NULL CHECK (char_length(resource) BETWEEN 1 AND 2048),
  scopes api_scopes[] NOT NULL CHECK (cardinality(scopes) > 0),
  occurred_at TIMESTAMPTZ NOT NULL GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  CHECK (num_nonnulls(authorization_request_id, access_token_id, refresh_token_family_id) = 1),
  CHECK (
    (event_type IN ('consent_approved', 'consent_denied') AND authorization_request_id IS NOT NULL)
    OR (event_type = 'access_token_revoked' AND access_token_id IS NOT NULL)
    OR (
      event_type IN ('refresh_family_revoked', 'refresh_reuse_detected')
      AND refresh_token_family_id IS NOT NULL
    )
  ),
  CHECK (
    (event_type = 'consent_denied' AND grant_id IS NULL)
    OR (event_type <> 'consent_denied' AND grant_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_oauth_authorization_server_events__user
ON oauth_authorization_server_events (user_id, id);

CREATE INDEX IF NOT EXISTS idx_oauth_authorization_server_events__client
ON oauth_authorization_server_events (client_id, id);

CREATE INDEX IF NOT EXISTS idx_oauth_authorization_server_events__grant_consent
ON oauth_authorization_server_events (grant_id, id DESC)
WHERE event_type = 'consent_approved';

CREATE INDEX IF NOT EXISTS idx_oauth_authorization_server_events__grant_id__foreign_key
ON oauth_authorization_server_events (grant_id)
WHERE grant_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_oauth_authorization_server_events__consent
ON oauth_authorization_server_events (authorization_request_id)
WHERE authorization_request_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_oauth_authorization_server_events__access_revocation
ON oauth_authorization_server_events (access_token_id)
WHERE access_token_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_oauth_authorization_server_events__family_lifecycle
ON oauth_authorization_server_events (refresh_token_family_id, event_type)
WHERE refresh_token_family_id IS NOT NULL;

CREATE OR REPLACE FUNCTION fn_reject_oauth_event_mutation()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE retention_cutoff TIMESTAMPTZ;
BEGIN
  IF TG_OP = 'DELETE' THEN
    retention_cutoff := NULLIF(current_setting('app.oauth_event_retention_cutoff', TRUE), '')::timestamptz;
    IF retention_cutoff IS NOT NULL AND uuid_extract_timestamp(OLD.id) < retention_cutoff THEN
      IF OLD.event_type = 'consent_approved' AND EXISTS (
        SELECT 1 FROM oauth_grant_retention_anchors anchor
        WHERE anchor.id = OLD.grant_id
          AND (anchor.ended_at IS NULL OR anchor.ended_at >= retention_cutoff)
          AND NOT EXISTS (
            SELECT 1 FROM oauth_authorization_server_events newer
            WHERE newer.grant_id = OLD.grant_id
              AND newer.event_type = 'consent_approved'
              AND newer.id > OLD.id
          )
      ) THEN
        RAISE EXCEPTION 'latest live OAuth consent evidence cannot be deleted'
          USING ERRCODE = 'check_violation';
      END IF;
      RETURN OLD;
    END IF;
  END IF;
  RAISE EXCEPTION 'oauth_authorization_server_events rows are append-only'
    USING ERRCODE = 'check_violation';
END;
$$;

CREATE OR REPLACE TRIGGER trigger_oauth_authorization_server_events_append_only
BEFORE UPDATE OR DELETE ON oauth_authorization_server_events
FOR EACH ROW EXECUTE FUNCTION fn_reject_oauth_event_mutation();
COMMENT ON FUNCTION fn_reject_oauth_event_mutation() IS 'Rejects event mutation except a retention transaction deleting expired, nonessential OAuth evidence; latest live grant consent stays.';

CREATE TABLE IF NOT EXISTS oauth_native_session_token_mints (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  user_id UUID NOT NULL REFERENCES retained_user_identities(id) ON DELETE RESTRICT,
  client_id UUID NOT NULL,
  grant_id UUID NOT NULL,
  session_id UUID NOT NULL,
  access_token_id UUID NOT NULL UNIQUE,
  attestation_status oauth_native_attestation_statuses NOT NULL,
  occurred_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL
);

CREATE INDEX IF NOT EXISTS idx_oauth_native_session_token_mints__user
ON oauth_native_session_token_mints (user_id, id);

CREATE OR REPLACE TRIGGER trigger_oauth_native_session_token_mints_append_only
BEFORE UPDATE OR DELETE ON oauth_native_session_token_mints
FOR EACH ROW EXECUTE FUNCTION fn_reject_mutation();

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TABLE IF NOT EXISTS oauth_authorization_codes (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  code_hash TEXT NOT NULL UNIQUE CHECK (char_length(code_hash) = 64),
  grant_id UUID NOT NULL REFERENCES oauth_grants ON DELETE CASCADE,
  redirect_uri TEXT NOT NULL CHECK (char_length(redirect_uri) BETWEEN 1 AND 2048),
  resource TEXT NOT NULL CHECK (char_length(resource) BETWEEN 1 AND 2048),
  scopes api_scopes[] NOT NULL CHECK (cardinality(scopes) > 0),
  code_challenge TEXT NOT NULL CHECK (code_challenge ~ '^[A-Za-z0-9_-]{43}$'),
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE OR REPLACE TRIGGER trigger_oauth_authorization_codes_updated_at
BEFORE UPDATE ON oauth_authorization_codes
FOR EACH ROW
EXECUTE FUNCTION fn_update_updated_at();

CREATE INDEX IF NOT EXISTS idx_oauth_authorization_codes__grant
ON oauth_authorization_codes (grant_id, id);

CREATE INDEX IF NOT EXISTS idx_oauth_authorization_codes__expiry
ON oauth_authorization_codes (expires_at, id);

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TABLE IF NOT EXISTS oauth_refresh_token_families (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  grant_id UUID NOT NULL REFERENCES oauth_grants ON DELETE CASCADE,
  resource TEXT NOT NULL CHECK (char_length(resource) BETWEEN 1 AND 2048),
  scopes api_scopes[] NOT NULL CHECK (cardinality(scopes) > 0),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  reuse_detected_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (reuse_detected_at IS NULL OR revoked_at IS NOT NULL),
  UNIQUE (id, grant_id)
);

CREATE OR REPLACE TRIGGER trigger_oauth_refresh_token_families_updated_at
BEFORE UPDATE ON oauth_refresh_token_families
FOR EACH ROW
EXECUTE FUNCTION fn_update_updated_at();

CREATE INDEX IF NOT EXISTS idx_oauth_refresh_token_families__grant
ON oauth_refresh_token_families (grant_id, id);

CREATE INDEX IF NOT EXISTS idx_oauth_refresh_token_families__expiry
ON oauth_refresh_token_families (expires_at, id);

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TABLE IF NOT EXISTS oauth_refresh_tokens (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  family_id UUID NOT NULL REFERENCES oauth_refresh_token_families ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE CHECK (char_length(token_hash) = 64),
  scopes api_scopes[] NOT NULL CHECK (cardinality(scopes) > 0),
  generation INTEGER NOT NULL CHECK (generation >= 0),
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  replaced_by_token_id UUID REFERENCES oauth_refresh_tokens ON DELETE SET NULL,
  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (family_id, generation),
  CHECK (replaced_by_token_id IS NULL OR consumed_at IS NOT NULL)
);

CREATE OR REPLACE TRIGGER trigger_oauth_refresh_tokens_updated_at
BEFORE UPDATE ON oauth_refresh_tokens
FOR EACH ROW
EXECUTE FUNCTION fn_update_updated_at();

CREATE INDEX IF NOT EXISTS idx_oauth_refresh_tokens__family
ON oauth_refresh_tokens (family_id, id);

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE INDEX IF NOT EXISTS idx_oauth_refresh_tokens__replacement
ON oauth_refresh_tokens (replaced_by_token_id)
WHERE replaced_by_token_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_oauth_refresh_tokens__expiry
ON oauth_refresh_tokens (expires_at, family_id, generation, id);

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TABLE IF NOT EXISTS oauth_access_tokens (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  grant_id UUID NOT NULL REFERENCES oauth_grants ON DELETE CASCADE,
  refresh_family_id UUID,
  token_hash TEXT NOT NULL UNIQUE CHECK (char_length(token_hash) = 64),
  resource TEXT NOT NULL CHECK (char_length(resource) BETWEEN 1 AND 2048),
  scopes api_scopes[] NOT NULL CHECK (cardinality(scopes) > 0),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_oauth_access_tokens__family_grant
    FOREIGN KEY (refresh_family_id, grant_id)
    REFERENCES oauth_refresh_token_families (id, grant_id) ON DELETE CASCADE
);

CREATE OR REPLACE TRIGGER trigger_oauth_access_tokens_updated_at
BEFORE UPDATE ON oauth_access_tokens
FOR EACH ROW
EXECUTE FUNCTION fn_update_updated_at();

CREATE INDEX IF NOT EXISTS idx_oauth_access_tokens__grant
ON oauth_access_tokens (grant_id, id);

CREATE INDEX IF NOT EXISTS idx_oauth_access_tokens__refresh_family
ON oauth_access_tokens (refresh_family_id, id)
WHERE refresh_family_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_oauth_access_tokens__family_grant
ON oauth_access_tokens (refresh_family_id, grant_id);

CREATE INDEX IF NOT EXISTS idx_oauth_access_tokens__expiry
ON oauth_access_tokens (expires_at, id);

COMMENT ON TABLE oauth_clients IS 'Dynamically registered and Client ID Metadata Document clients for the Voucha OAuth authorization server.';
COMMENT ON TABLE oauth_authorization_requests IS 'Short-lived browser consent requests bound to one Voucha user session.';
COMMENT ON TABLE oauth_grants IS 'Durable user consent for one client, resource, and canonical scope set.';
COMMENT ON TABLE oauth_authorization_server_events IS 'Durable OAuth consent and token revocation evidence. Ordinary mutation is rejected; bounded retention deletes after 12 months while the latest consent remains through the live grant and for 12 months after its end.';
COMMENT ON TABLE oauth_native_session_token_mints IS 'Append-only record of native-session MCP token issuance, preserved after grant or session deletion.';
COMMENT ON COLUMN oauth_native_session_token_mints.user_id IS 'Retained user identity at mint time.';
COMMENT ON COLUMN oauth_native_session_token_mints.client_id IS 'Snapshot of native OAuth client identifier at mint time.';
COMMENT ON COLUMN oauth_native_session_token_mints.grant_id IS 'Snapshot of session-scoped grant identifier at mint time.';
COMMENT ON COLUMN oauth_native_session_token_mints.session_id IS 'Snapshot of authenticating session identifier at mint time.';
COMMENT ON COLUMN oauth_native_session_token_mints.access_token_id IS 'Snapshot of issued access token identifier, never the bearer secret.';
COMMENT ON COLUMN oauth_native_session_token_mints.attestation_status IS 'Whether this mint verified an App Attest request signature.';
COMMENT ON COLUMN oauth_native_session_token_mints.occurred_at IS 'UUIDv7-derived mint time.';
COMMENT ON TABLE oauth_authorization_codes IS 'Single-use S256 authorization codes stored only as purpose-bound hashes.';
COMMENT ON TABLE oauth_refresh_token_families IS 'Rotating refresh-token family lifecycle and reuse detection.';
COMMENT ON TABLE oauth_refresh_tokens IS 'Single-use refresh tokens stored only as purpose-bound hashes.';
COMMENT ON TABLE oauth_access_tokens IS 'Opaque access tokens stored only as purpose-bound hashes.';

COMMENT ON COLUMN oauth_clients.client_id IS 'Public OAuth client identifier issued at registration or the exact Client ID Metadata Document URL.';
COMMENT ON COLUMN oauth_clients.first_granted_at IS 'First grant creation time; non-NULL permanently excludes a client from never-used registration cleanup.';
COMMENT ON COLUMN oauth_clients.metadata_refresh_generation IS 'Database-ordered generation of the newest Client ID Metadata Document fetch applied to this row; NULL for registered clients.';
COMMENT ON COLUMN oauth_clients.metadata_refreshed_at IS 'Fetch-start time of the newest Client ID Metadata Document representation applied to this row; NULL for registered clients.';
COMMENT ON COLUMN oauth_clients.metadata_expires_at IS 'Time after which the stored Client ID Metadata Document must be refreshed for a new authorization; NULL for registered clients.';
COMMENT ON COLUMN oauth_clients.owner_user_id IS 'Voucha user that owns the client when registration is authenticated.';
COMMENT ON COLUMN oauth_clients.client_name IS 'Display-safe client name shown during consent.';
COMMENT ON COLUMN oauth_clients.client_type IS 'Public or confidential OAuth client classification.';
COMMENT ON COLUMN oauth_clients.token_endpoint_auth_method IS 'Client authentication method accepted by token and revocation endpoints.';
COMMENT ON COLUMN oauth_clients.redirect_uris IS 'Exact validated redirect URIs registered for the client.';
COMMENT ON COLUMN oauth_clients.grant_types IS 'OAuth grant types registered for the client.';
COMMENT ON COLUMN oauth_clients.response_types IS 'OAuth authorization response types registered for the client.';
COMMENT ON COLUMN oauth_clients.scopes IS 'Maximum canonical scope set the client may request.';
COMMENT ON COLUMN oauth_clients.client_secret_hash IS 'Purpose-bound hash of a one-time confidential client secret.';
COMMENT ON COLUMN oauth_clients.revoked_at IS 'Time at which the client was revoked.';

COMMENT ON COLUMN oauth_authorization_requests.client_id IS 'Client requesting delegated authorization.';
COMMENT ON COLUMN oauth_authorization_requests.user_id IS 'Authenticated user who owns the consent decision.';
COMMENT ON COLUMN oauth_authorization_requests.browser_binding_hash IS 'Purpose-bound hash binding the request to one browser device and session.';
COMMENT ON COLUMN oauth_authorization_requests.redirect_uri IS 'Validated callback URI for this authorization request.';
COMMENT ON COLUMN oauth_authorization_requests.client_state IS 'Opaque client state returned unchanged to the callback.';
COMMENT ON COLUMN oauth_authorization_requests.resource IS 'Protected resource audience requested by the client.';
COMMENT ON COLUMN oauth_authorization_requests.scopes IS 'Canonical scopes presented for user consent.';
COMMENT ON COLUMN oauth_authorization_requests.code_challenge IS 'Base64url SHA-256 PKCE challenge for the authorization code.';
COMMENT ON COLUMN oauth_authorization_requests.expires_at IS 'Time after which the pending request cannot be decided.';
COMMENT ON COLUMN oauth_authorization_requests.approved_at IS 'Time at which the owning user approved the request.';
COMMENT ON COLUMN oauth_authorization_requests.denied_at IS 'Time at which the request was denied or superseded.';

COMMENT ON COLUMN oauth_grants.user_id IS 'User who consented to the delegated grant.';
COMMENT ON COLUMN oauth_grants.client_id IS 'Client receiving the delegated grant.';
COMMENT ON COLUMN oauth_grants.session_id IS 'Native app session that may silently mint member MCP access; deletion cascades to this grant.';
COMMENT ON COLUMN oauth_grants.attestation_status IS 'Attestation status of the most recent native-session mint.';
COMMENT ON COLUMN oauth_grants.resource IS 'Protected resource audience covered by the grant.';
COMMENT ON COLUMN oauth_grants.scopes IS 'Latest canonical scope set consented for this client and resource.';
COMMENT ON COLUMN oauth_grants.consented_at IS 'Time of the latest affirmative consent decision.';
COMMENT ON COLUMN oauth_grants.last_used_at IS 'Time at which the grant most recently issued or refreshed tokens.';
COMMENT ON COLUMN oauth_grants.revoked_at IS 'Time at which the complete grant was revoked.';

COMMENT ON COLUMN oauth_authorization_server_events.event_type IS 'Immutable consent, explicit revocation, or refresh-reuse lifecycle outcome.';
COMMENT ON COLUMN oauth_authorization_server_events.authorization_request_id IS 'Short-lived authorization request that produced a consent event; intentionally not a foreign key.';
COMMENT ON COLUMN oauth_authorization_server_events.access_token_id IS 'Short-lived access token affected by a revocation event; intentionally not a foreign key.';
COMMENT ON COLUMN oauth_authorization_server_events.refresh_token_family_id IS 'Short-lived refresh family affected by revocation or reuse; intentionally not a foreign key.';
COMMENT ON COLUMN oauth_authorization_server_events.user_id IS 'Grant owner at event time; references the retained user identity so hard deletion preserves the audit record.';
COMMENT ON COLUMN oauth_authorization_server_events.client_id IS 'Client internal identifier at event time; intentionally not a foreign key so client deletion preserves the audit record.';
COMMENT ON COLUMN oauth_authorization_server_events.grant_id IS 'Retained, non-authorizing grant identity; survives deletion of the live grant until its consent evidence expires.';
COMMENT ON COLUMN oauth_authorization_server_events.resource IS 'Protected resource audience affected by the event.';
COMMENT ON COLUMN oauth_authorization_server_events.scopes IS 'Canonical scope set affected by the event.';
COMMENT ON COLUMN oauth_authorization_server_events.occurred_at IS 'UUIDv7-derived time at which the event was recorded.';

COMMENT ON COLUMN oauth_authorization_codes.code_hash IS 'Purpose-bound hash of the one-time authorization code.';
COMMENT ON COLUMN oauth_authorization_codes.grant_id IS 'Delegated grant represented by the code.';
COMMENT ON COLUMN oauth_authorization_codes.redirect_uri IS 'Callback URI bound to the code exchange.';
COMMENT ON COLUMN oauth_authorization_codes.resource IS 'Protected resource audience bound to the code.';
COMMENT ON COLUMN oauth_authorization_codes.scopes IS 'Canonical scope set bound to the code.';
COMMENT ON COLUMN oauth_authorization_codes.code_challenge IS 'Base64url SHA-256 PKCE challenge bound to the code.';
COMMENT ON COLUMN oauth_authorization_codes.expires_at IS 'Time after which the code cannot be exchanged.';
COMMENT ON COLUMN oauth_authorization_codes.consumed_at IS 'Time at which the code was exchanged successfully.';

COMMENT ON COLUMN oauth_refresh_token_families.grant_id IS 'Delegated grant represented by the rotating family.';
COMMENT ON COLUMN oauth_refresh_token_families.resource IS 'Protected resource audience bound to the family.';
COMMENT ON COLUMN oauth_refresh_token_families.scopes IS 'Maximum canonical scope set available to family members.';
COMMENT ON COLUMN oauth_refresh_token_families.expires_at IS 'Absolute expiry shared by every family member.';
COMMENT ON COLUMN oauth_refresh_token_families.revoked_at IS 'Time at which the complete token family was revoked.';
COMMENT ON COLUMN oauth_refresh_token_families.reuse_detected_at IS 'Time at which replay of a consumed family member was detected.';

COMMENT ON COLUMN oauth_refresh_tokens.family_id IS 'Rotating refresh-token family containing this member.';
COMMENT ON COLUMN oauth_refresh_tokens.token_hash IS 'Purpose-bound hash of the opaque refresh token.';
COMMENT ON COLUMN oauth_refresh_tokens.scopes IS 'Canonical scope set carried by this family member.';
COMMENT ON COLUMN oauth_refresh_tokens.generation IS 'Monotonic position of this member within its family.';
COMMENT ON COLUMN oauth_refresh_tokens.expires_at IS 'Time after which this refresh token cannot be exchanged.';
COMMENT ON COLUMN oauth_refresh_tokens.consumed_at IS 'Time at which this refresh token was rotated.';
COMMENT ON COLUMN oauth_refresh_tokens.revoked_at IS 'Time at which this refresh token was revoked directly.';
COMMENT ON COLUMN oauth_refresh_tokens.replaced_by_token_id IS 'Successor issued when this refresh token was rotated.';

COMMENT ON COLUMN oauth_access_tokens.grant_id IS 'Delegated grant represented by the access token.';
COMMENT ON COLUMN oauth_access_tokens.refresh_family_id IS 'Refresh family that issued the access token.';
COMMENT ON COLUMN oauth_access_tokens.token_hash IS 'Purpose-bound hash of the opaque bearer token.';
COMMENT ON COLUMN oauth_access_tokens.resource IS 'Protected resource audience bound to the access token.';
COMMENT ON COLUMN oauth_access_tokens.scopes IS 'Canonical scopes carried by the access token.';
COMMENT ON COLUMN oauth_access_tokens.expires_at IS 'Time after which the access token is invalid.';
COMMENT ON COLUMN oauth_access_tokens.revoked_at IS 'Time at which the access token was revoked.';
COMMENT ON COLUMN oauth_access_tokens.last_used_at IS 'Time at which bearer validation last succeeded.';

ALTER TABLE moderator_actions DROP CONSTRAINT IF EXISTS fk_moderator_actions__oauth_client_id;
ALTER TABLE moderator_actions ADD CONSTRAINT fk_moderator_actions__oauth_client_id
  FOREIGN KEY (oauth_client_id) REFERENCES oauth_clients (id) ON DELETE SET NULL NOT VALID;
ALTER TABLE moderator_actions VALIDATE CONSTRAINT fk_moderator_actions__oauth_client_id;
