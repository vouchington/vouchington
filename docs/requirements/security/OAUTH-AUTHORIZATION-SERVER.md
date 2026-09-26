# OAuth Authorization Server

Voucha is an OAuth 2.1 authorization server for user-approved API and MCP access. This is distinct
from the social OAuth clients used to sign users into Voucha.

## Supported flow

Third-party clients register through `POST /register`, start authorization at `GET /authorize`,
collect consent in the signed-in Voucha session, and exchange the resulting code at `POST /token`.
Authorization code exchange always requires S256 PKCE. Successful exchanges return opaque access
and rotating refresh tokens. `POST /revoke` revokes either token class without revealing whether a
presented token existed.

The server intentionally does not support implicit, password, client-credentials, plain-PKCE,
OpenID Connect, ID-token, or UserInfo flows.

## Security invariants

- Redirect URIs must be registered exactly. HTTPS is required except for HTTP loopback clients.
  The match is rechecked when the user decides on consent and when the code is exchanged, under a
  share lock on the client row, so a URI the owner has removed, even concurrently, receives neither
  a code nor tokens.
- Authorization errors redirect only after the client and redirect URI have both been verified.
- Codes, access tokens, refresh tokens, and client secrets are stored only as purpose-bound hashes.
  Plaintext credentials are returned once.
- Authorization codes are single-use. Their exchange and token issuance share one PostgreSQL
  transaction and lock the code and grant.
- Refresh tokens rotate on every use. Reuse of a consumed token revokes its entire family and every
  access token derived from that family.
- Consent requests are bound to the signed-in user, device, and session and are not cacheable.
- Consent decisions, explicit revocations, and refresh-token reuse detection produce immutable
  lifecycle evidence that survives short-lived credential retention and identity deletion.
- Protocol and consent responses use `no-store`; the edge never caches these routes.
- Cross-site `POST /register`, `POST /token`, and `POST /revoke` requests pass the listener CSRF
  guard only after the Worker-secret boundary; those endpoints ignore browser cookies and enforce
  registration, client, PKCE, or token authentication. The cookie-authenticated consent mutation
  remains origin-guarded.
- Suspended users cannot begin or decide consent, exchange a previously approved code, refresh a
  token, or authenticate with an existing access token.

## Client types

Public clients authenticate with their `client_id` and mandatory PKCE. Confidential clients also
authenticate with HTTP Basic and a generated client secret. B1 implements RFC 7591 registration,
not the RFC 7592 registration-management protocol, so it does not mint an unused registration
management credential. Authenticated client and grant management is owned by the API-key and
OAuth-app management milestone.

Signed-in users register and manage their own clients through `/api/v1/my/oauth-apps`
([OAuth apps](../users/api-keys.md#oauth-apps)). Owner registration reuses the RFC 7591 validators
and records `owner_user_id`; rotation replaces the stored client-secret hash and returns the new
secret once, and renaming a client or replacing its redirect URIs clears `verified_at` and
`verified_by_id` in the same update. Every owner mutation first takes the account-deletion lock
(`fn_lock_active_user_for_mutation`), so a request that authenticated just before the owner's
deletion committed cannot change the app or mint a secret afterwards. Account deletion does not yet
revoke the apps the account owns; [#710](https://github.com/vouchington/vouchington/issues/710)
tracks it.

Users list and revoke the grants they approved through `/api/v1/my/oauth-grants`
([connected apps](../users/api-keys.md#connected-apps)). A revoked grant fails the bearer, refresh
and code paths on their next use because each requires an unrevoked grant. The listed `verified`
flag reflects the client's `verified_at`, and `last_used_at` is the later of the grant's own
timestamp and its newest access-token use.

## Persistence and retention

Durable clients, grants, and append-only authorization lifecycle events are separate from short-lived
consent requests, codes, access tokens, and refresh-token families. Data retention deletes expired
protocol artifacts in bounded, retry-safe batches while preserving clients, grants, and consent and
revocation evidence. Expiry indexes include terminal rows so consumed and revoked credentials remain
prunable.

Clients are retired through `revoked_at` and never deleted, because
[content provenance](../content/content-provenance.md) references the client that created each
row. `metadata_url`, `verified_at` and `verified_by_id` decide whether a public provenance label may
name the client; they stay `NULL` until Client ID Metadata Documents and staff verification ship.

## Protected resources and discovery

- Two protected resources share the site origin: the user MCP server (`/api/v1/mcp`) and the admin
  MCP server (`/api/v1/admin/mcp`). Every consent request, code, grant, and token binds to exactly
  one of them, and each MCP route accepts only tokens bound to itself.
- The issuer is the configured site origin, never the request `Host`. Authorization responses,
  including errors, carry the RFC 9207 `iss` parameter.
- Discovery documents are anonymous and publicly cacheable:
  - RFC 8414 authorization-server metadata at `/.well-known/oauth-authorization-server`
  - RFC 9728 protected-resource metadata at `/.well-known/oauth-protected-resource/api/v1/mcp` and
    `/.well-known/oauth-protected-resource/api/v1/admin/mcp`. There is no root document, because two
    resources share one origin.
  - Staging Basic Auth exempts them; see
    [Cloudflare Worker staging auth](../../operations/cloudflare-worker-staging-auth.md).
- `/authorize` redirects an unsupported `resource` back to the verified client as `invalid_target`.
  Only administrators can approve the admin resource; anyone else gets `access_denied`.
- `/token` accepts an optional RFC 8707 `resource`, which must name the bound resource. A mismatch
  is `invalid_target` and leaves the code unconsumed. A refresh may narrow its scopes with `scope`.
- A client's registered scopes cover a requested scope by the same rule as MCP tool authorization,
  so a client registered for `mcp.user:write` may request `cards:write`.

## MCP challenges

The MCP routes accept an OAuth access token or an MCP API key as the bearer credential.

- A missing credential gets `401` with
  `WWW-Authenticate: Bearer resource_metadata="…", scope="mcp.<audience>:read mcp.<audience>:write"`.
- An unknown, expired, or revoked token, a token for the other resource, or a suspended owner gets
  `401` with `error="invalid_token"`.
- A single `tools/call` whose only failure is a missing scope gets `403` with
  `error="insufficient_scope"` and a `scope` naming the granted scopes plus the tool's, so re-consent
  never drops access the grant already holds.
- Role and plan denials, JSON-RPC batches, and API keys keep in-band JSON-RPC errors: re-consent
  cannot fix a role or plan, a batch has no single tool to step up for, and an API key cannot be
  re-authorized.

## Ownership boundaries

Client ID Metadata Documents and client and grant management UX are layered follow-up work.

## Related

- [Authentication architecture](../../overview/architecture/auth-overview.md)
- [Security requirements](./SECURITY.md)
- [API routes](../../../backend/api/oauth/README.md)
- [Authorization-server service](../../../backend/services/oauth-authorization-server/README.md)
