CREATE TABLE IF NOT EXISTS oauth_clients (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  metadata_url TEXT,
  verified_at TIMESTAMPTZ,
  verified_by_id UUID REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT oauth_clients_metadata_url_check CHECK (
    metadata_url IS NULL OR (
      char_length(metadata_url) <= 2048
      AND metadata_url ~ '^https://[a-z0-9.-]+(:[0-9]{1,5})?/[^#[:space:][:cntrl:]]*$'
      AND metadata_url !~ '/\.\.?(/|\?|$)'
    )
  ),
  CONSTRAINT oauth_clients_verified_by_id_check CHECK (verified_by_id IS NULL OR verified_at IS NOT NULL),
  client_id TEXT NOT NULL UNIQUE CHECK (client_id ~ '^voucha_[A-Za-z0-9_-]{32,}$'),
  owner_user_id UUID REFERENCES users ON DELETE SET NULL,
  client_name TEXT NOT NULL CHECK (char_length(client_name) BETWEEN 1 AND 120),
  client_type TEXT NOT NULL CHECK (client_type IN ('public', 'confidential')),
  token_endpoint_auth_method TEXT NOT NULL CHECK (
    token_endpoint_auth_method IN ('none', 'client_secret_basic')
  ),
  redirect_uris TEXT[] NOT NULL CHECK (cardinality(redirect_uris) BETWEEN 1 AND 10),
  grant_types TEXT[] NOT NULL CHECK (
    grant_types <@ ARRAY['authorization_code', 'refresh_token']::TEXT[]
    AND grant_types @> ARRAY['authorization_code', 'refresh_token']::TEXT[]
  ),
  response_types TEXT[] NOT NULL CHECK (response_types = ARRAY['code']::TEXT[]),
  scopes TEXT[] NOT NULL CHECK (cardinality(scopes) > 0),
  client_secret_hash TEXT CHECK (client_secret_hash IS NULL OR char_length(client_secret_hash) = 64),
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
  )
);

CREATE OR REPLACE TRIGGER trigger_oauth_clients_updated_at
BEFORE UPDATE ON oauth_clients
FOR EACH ROW
EXECUTE FUNCTION fn_update_updated_at();

CREATE INDEX IF NOT EXISTS idx_oauth_clients__owner
ON oauth_clients (owner_user_id, id)
WHERE owner_user_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS oauth_authorization_requests (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  client_id UUID NOT NULL REFERENCES oauth_clients ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users ON DELETE CASCADE,
  browser_binding_hash TEXT NOT NULL CHECK (char_length(browser_binding_hash) = 64),
  redirect_uri TEXT NOT NULL CHECK (char_length(redirect_uri) BETWEEN 1 AND 2048),
  state TEXT NOT NULL CHECK (char_length(state) BETWEEN 1 AND 1024),
  resource TEXT NOT NULL CHECK (char_length(resource) BETWEEN 1 AND 2048),
  scopes TEXT[] NOT NULL CHECK (cardinality(scopes) > 0),
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

CREATE TABLE IF NOT EXISTS oauth_grants (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  user_id UUID NOT NULL REFERENCES users ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES oauth_clients ON DELETE CASCADE,
  resource TEXT NOT NULL CHECK (char_length(resource) BETWEEN 1 AND 2048),
  scopes TEXT[] NOT NULL CHECK (cardinality(scopes) > 0),
  consented_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_used_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE OR REPLACE TRIGGER trigger_oauth_grants_updated_at
BEFORE UPDATE ON oauth_grants
FOR EACH ROW
EXECUTE FUNCTION fn_update_updated_at();

CREATE UNIQUE INDEX IF NOT EXISTS idx_oauth_grants__active_subject
ON oauth_grants (user_id, client_id, resource)
WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_oauth_grants__client
ON oauth_grants (client_id, id);

CREATE INDEX IF NOT EXISTS idx_oauth_grants__user
ON oauth_grants (user_id, id);

CREATE TABLE IF NOT EXISTS oauth_authorization_server_events (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  event_type TEXT NOT NULL CHECK (event_type IN (
    'consent_approved',
    'consent_denied',
    'access_token_revoked',
    'refresh_family_revoked',
    'refresh_reuse_detected'
  )),
  authorization_request_id UUID,
  access_token_id UUID,
  refresh_token_family_id UUID,
  user_id UUID NOT NULL,
  client_id UUID NOT NULL,
  grant_id UUID,
  resource TEXT NOT NULL CHECK (char_length(resource) BETWEEN 1 AND 2048),
  scopes TEXT[] NOT NULL CHECK (cardinality(scopes) > 0),
  occurred_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
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

CREATE UNIQUE INDEX IF NOT EXISTS idx_oauth_authorization_server_events__consent
ON oauth_authorization_server_events (authorization_request_id)
WHERE authorization_request_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_oauth_authorization_server_events__access_revocation
ON oauth_authorization_server_events (access_token_id)
WHERE access_token_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_oauth_authorization_server_events__family_lifecycle
ON oauth_authorization_server_events (refresh_token_family_id, event_type)
WHERE refresh_token_family_id IS NOT NULL;

CREATE OR REPLACE FUNCTION fn_reject_oauth_authorization_server_event_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'oauth authorization server events are append-only' USING ERRCODE = '23514';
END $$;

CREATE OR REPLACE TRIGGER trigger_oauth_authorization_server_events_append_only
BEFORE UPDATE OR DELETE ON oauth_authorization_server_events
FOR EACH ROW EXECUTE FUNCTION fn_reject_oauth_authorization_server_event_mutation();

CREATE TABLE IF NOT EXISTS oauth_authorization_codes (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  code_hash TEXT NOT NULL UNIQUE CHECK (char_length(code_hash) = 64),
  grant_id UUID NOT NULL REFERENCES oauth_grants ON DELETE CASCADE,
  redirect_uri TEXT NOT NULL CHECK (char_length(redirect_uri) BETWEEN 1 AND 2048),
  resource TEXT NOT NULL CHECK (char_length(resource) BETWEEN 1 AND 2048),
  scopes TEXT[] NOT NULL CHECK (cardinality(scopes) > 0),
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

CREATE TABLE IF NOT EXISTS oauth_refresh_token_families (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  grant_id UUID NOT NULL REFERENCES oauth_grants ON DELETE CASCADE,
  resource TEXT NOT NULL CHECK (char_length(resource) BETWEEN 1 AND 2048),
  scopes TEXT[] NOT NULL CHECK (cardinality(scopes) > 0),
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

CREATE TABLE IF NOT EXISTS oauth_refresh_tokens (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  family_id UUID NOT NULL REFERENCES oauth_refresh_token_families ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE CHECK (char_length(token_hash) = 64),
  scopes TEXT[] NOT NULL CHECK (cardinality(scopes) > 0),
  generation INTEGER NOT NULL CHECK (generation >= 0),
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  replaced_by_id UUID REFERENCES oauth_refresh_tokens ON DELETE SET NULL,
  created_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (family_id, generation),
  CHECK (replaced_by_id IS NULL OR consumed_at IS NOT NULL)
);

CREATE OR REPLACE TRIGGER trigger_oauth_refresh_tokens_updated_at
BEFORE UPDATE ON oauth_refresh_tokens
FOR EACH ROW
EXECUTE FUNCTION fn_update_updated_at();

CREATE INDEX IF NOT EXISTS idx_oauth_refresh_tokens__family
ON oauth_refresh_tokens (family_id, id);

CREATE INDEX IF NOT EXISTS idx_oauth_refresh_tokens__replacement
ON oauth_refresh_tokens (replaced_by_id)
WHERE replaced_by_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_oauth_refresh_tokens__expiry
ON oauth_refresh_tokens (expires_at, id)
WHERE consumed_at IS NULL AND revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS oauth_access_tokens (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  grant_id UUID NOT NULL REFERENCES oauth_grants ON DELETE CASCADE,
  refresh_family_id UUID NOT NULL,
  token_hash TEXT NOT NULL UNIQUE CHECK (char_length(token_hash) = 64),
  resource TEXT NOT NULL CHECK (char_length(resource) BETWEEN 1 AND 2048),
  scopes TEXT[] NOT NULL CHECK (cardinality(scopes) > 0),
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

COMMENT ON TABLE oauth_clients IS 'Dynamically registered clients for the Voucha OAuth authorization server.';
COMMENT ON TABLE oauth_authorization_requests IS 'Short-lived browser consent requests bound to one Voucha user session.';
COMMENT ON TABLE oauth_grants IS 'Durable user consent for one client, resource, and canonical scope set.';
COMMENT ON TABLE oauth_authorization_server_events IS 'Append-only durable evidence of OAuth consent and token revocation lifecycle events; identity columns intentionally have no foreign keys so retention and identity deletion cannot erase the audit record.';
COMMENT ON TABLE oauth_authorization_codes IS 'Single-use S256 authorization codes stored only as purpose-bound hashes.';
COMMENT ON TABLE oauth_refresh_token_families IS 'Rotating refresh-token family lifecycle and reuse detection.';
COMMENT ON TABLE oauth_refresh_tokens IS 'Single-use refresh tokens stored only as purpose-bound hashes.';
COMMENT ON TABLE oauth_access_tokens IS 'Opaque access tokens stored only as purpose-bound hashes.';

COMMENT ON COLUMN oauth_clients.client_id IS 'Public OAuth client identifier issued at registration.';
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
COMMENT ON COLUMN oauth_authorization_requests.state IS 'Opaque client state returned unchanged to the callback.';
COMMENT ON COLUMN oauth_authorization_requests.resource IS 'Protected resource audience requested by the client.';
COMMENT ON COLUMN oauth_authorization_requests.scopes IS 'Canonical scopes presented for user consent.';
COMMENT ON COLUMN oauth_authorization_requests.code_challenge IS 'Base64url SHA-256 PKCE challenge for the authorization code.';
COMMENT ON COLUMN oauth_authorization_requests.expires_at IS 'Time after which the pending request cannot be decided.';
COMMENT ON COLUMN oauth_authorization_requests.approved_at IS 'Time at which the owning user approved the request.';
COMMENT ON COLUMN oauth_authorization_requests.denied_at IS 'Time at which the request was denied or superseded.';

COMMENT ON COLUMN oauth_grants.user_id IS 'User who consented to the delegated grant.';
COMMENT ON COLUMN oauth_grants.client_id IS 'Client receiving the delegated grant.';
COMMENT ON COLUMN oauth_grants.resource IS 'Protected resource audience covered by the grant.';
COMMENT ON COLUMN oauth_grants.scopes IS 'Latest canonical scope set consented for this client and resource.';
COMMENT ON COLUMN oauth_grants.consented_at IS 'Time of the latest affirmative consent decision.';
COMMENT ON COLUMN oauth_grants.last_used_at IS 'Time at which the grant most recently issued or refreshed tokens.';
COMMENT ON COLUMN oauth_grants.revoked_at IS 'Time at which the complete grant was revoked.';

COMMENT ON COLUMN oauth_authorization_server_events.event_type IS 'Immutable consent, explicit revocation, or refresh-reuse lifecycle outcome.';
COMMENT ON COLUMN oauth_authorization_server_events.authorization_request_id IS 'Short-lived authorization request that produced a consent event; intentionally not a foreign key.';
COMMENT ON COLUMN oauth_authorization_server_events.access_token_id IS 'Short-lived access token affected by a revocation event; intentionally not a foreign key.';
COMMENT ON COLUMN oauth_authorization_server_events.refresh_token_family_id IS 'Short-lived refresh family affected by revocation or reuse; intentionally not a foreign key.';
COMMENT ON COLUMN oauth_authorization_server_events.user_id IS 'Grant owner at event time; intentionally not a foreign key so hard deletion preserves the audit record.';
COMMENT ON COLUMN oauth_authorization_server_events.client_id IS 'Client internal identifier at event time; intentionally not a foreign key so client deletion preserves the audit record.';
COMMENT ON COLUMN oauth_authorization_server_events.grant_id IS 'Grant internal identifier at event time; intentionally not a foreign key so grant deletion preserves the audit record.';
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
COMMENT ON COLUMN oauth_refresh_tokens.replaced_by_id IS 'Successor issued when this refresh token was rotated.';

COMMENT ON COLUMN oauth_access_tokens.grant_id IS 'Delegated grant represented by the access token.';
COMMENT ON COLUMN oauth_access_tokens.refresh_family_id IS 'Refresh family that issued the access token.';
COMMENT ON COLUMN oauth_access_tokens.token_hash IS 'Purpose-bound hash of the opaque bearer token.';
COMMENT ON COLUMN oauth_access_tokens.resource IS 'Protected resource audience bound to the access token.';
COMMENT ON COLUMN oauth_access_tokens.scopes IS 'Canonical scopes carried by the access token.';
COMMENT ON COLUMN oauth_access_tokens.expires_at IS 'Time after which the access token is invalid.';
COMMENT ON COLUMN oauth_access_tokens.revoked_at IS 'Time at which the access token was revoked.';
COMMENT ON COLUMN oauth_access_tokens.last_used_at IS 'Time at which bearer validation last succeeded.';
