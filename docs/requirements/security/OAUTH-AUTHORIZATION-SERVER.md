# OAuth Authorization Server

Voucha is an OAuth 2.1 authorization server for user-approved API and MCP access. This is distinct
from the social OAuth clients used to sign users into Voucha.

## Supported flow

Third-party clients register through `POST /register` or identify themselves with an HTTPS Client
ID Metadata Document URL, start authorization at `GET /authorize`, collect consent in the signed-in
Voucha session, and exchange the resulting code at `POST /token`.
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
- Code exchange, refresh and revocation authenticate the client against its row under a share lock
  held until their transaction commits. A secret rotation or client revocation waits for in-flight
  token requests, and later requests see the new state, so a replaced secret obtains no tokens once
  rotation returns.
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
- Deleted grant subjects and apps owned by deleted users lose OAuth authority when the account-deletion
  fence commits, before the worker begins credential cleanup.

## Client types

Public clients authenticate with their `client_id` and mandatory PKCE. Confidential clients also
authenticate with HTTP Basic and a generated client secret. B1 implements RFC 7591 registration,
not the RFC 7592 registration-management protocol, so it does not mint an unused registration
management credential. Signed-in owners and administrators manage clients and grants through the
first-party routes below instead.

Signed-in users register and manage their own clients through `/api/v1/my/oauth-apps`
([OAuth apps](../users/oauth-apps.md#oauth-apps)). Owner registration reuses the RFC 7591 validators
and records `owner_user_id`; rotation replaces the stored client-secret hash and returns the new
secret once, and renaming a client or replacing its redirect URIs clears `verified_at` and
`verified_by_id` in the same update. Every owner mutation first takes the account-deletion lock
(`fn_lock_active_user_for_mutation`), so a request that authenticated just before the owner's
deletion committed cannot change the app or mint a secret afterwards. Account deletion revokes
the apps the account owns in bounded worker batches.

### Client ID Metadata Documents

An HTTPS URL with a path may be used directly as `client_id`. Voucha fetches that exact URL through
the SSRF-safe, DNS-pinned HTTP boundary and never follows redirects. Userinfo, fragments, dot path
segments, private or special-use targets, non-200 responses, non-JSON responses, documents larger
than 5 KiB, and responses exceeding the 5-second header or 5-second body budget are rejected. The
document's `client_id` must equal the requested URL byte for byte.

CIMD clients are public, secretless clients and still require S256 PKCE. Their names, redirect URIs,
grant types, response types, and scopes use the RFC 7591 validators, except redirect strings remain
unserialized so authorization can use simple string comparison. Shared-secret methods and values,
and private key material embedded in JWK metadata, are rejected. Public JWK metadata is permitted
but does not change Voucha's supported `none` authentication method.

A validated document is upserted into `oauth_clients` under the exact URL so the existing request,
grant, token, evidence, and provenance foreign keys remain authoritative. Cache freshness respects
`Cache-Control: max-age` or, when absent, `Expires` relative to `Date`, with a 5-minute default and
1-hour ceiling after response age is deducted.
`no-cache`, `no-store`, and zero remaining freshness require another fetch for the next
authorization. Failed or invalid refreshes abort authorization and cannot authorize an error
redirect through stale metadata. Database-ordered refresh generations prevent an older concurrent
response from overwriting a newer validated representation; the fetch-start timestamp remains the
recorded refresh time.

Consent uses a reviewed display name only when the exact document URL is in
`known-clients.mts`. Otherwise it uses the URL hostname, and the hostname is always visible. RFC
7591 registration and owned-app clients retain their existing behavior.

Administrators verify dynamically registered clients through `/api/v1/admin/oauth-clients`
([Admin API](../../../backend/api/v1/admin/README.md)). Verification records `verified_at` and
`verified_by_id` only when the stored `client_name` and `redirect_uris` still equal the name and
redirect URIs the administrator reviewed, so an owner's rename or re-pointing between review and
approval returns 409 instead of verifying what staff never saw. The staff UI refreshes that
conflicted row from the server before another review, so a retry cannot approve stale name or
redirect-URI data.
Revoked clients and Client ID Metadata Document clients cannot be verified. Clearing verification
sets both columns back to `NULL`. A suspended administrator can neither verify nor clear
verification. Staff review the queue at `/admin/oauth-clients`, which defaults to unverified
clients, filters to verified or all clients, shows each client's owner (or none for an anonymous
registration), redirect URIs and scopes, and verifies the displayed name and redirect URIs or
removes verification from the row.

Users list and revoke the grants they approved through `/api/v1/my/oauth-grants`
([connected apps](../users/oauth-apps.md#connected-apps)). A revoked grant fails the bearer, refresh
and code paths on their next use because each requires an unrevoked grant. The listed `verified`
flag reflects the client's `verified_at`, and `last_used_at` is the later of the grant's own
token-exchange timestamp and its newest access-token use. Consent and re-consent update
`consented_at` without counting as use: a grant stays unused until a code or refresh-token exchange
or successful bearer validation, and later consent preserves its prior real-use timestamp.

## Persistence and retention

Durable clients, grants, and append-only authorization lifecycle events are separate from short-lived
consent requests, codes, access tokens, and refresh-token families. Data retention deletes expired
protocol artifacts in bounded, retry-safe batches while preserving clients, grants, and consent and
revocation evidence. Expiry indexes include terminal rows so consumed and revoked credentials remain
prunable.

Clients are retired through `revoked_at` and never deleted, because
[content provenance](../content/content-provenance.md) references the client that created each
row. `metadata_url`, `verified_at` and `verified_by_id` decide whether a public provenance label may
name the client. `metadata_url` is the exact identifier URL for Client ID Metadata Document clients
and stays `NULL` for dynamically registered and owned clients. `metadata_refresh_generation`
orders concurrent document updates, `metadata_refreshed_at` records the winning fetch's start time,
and `metadata_expires_at` controls reuse for new authorization requests.

## Account deletion

Bearer validation, code exchange, refresh, revocation, and consent acquire shared account-deletion
locks for their participating users before locking OAuth artifacts. Independent grants under one
app owner can proceed concurrently; deletion and owned-client registration or management take
exclusive locks and serialize with those requests. Participants are locked in UUID order and
rechecked after the locks are acquired. A deleted grant subject cannot exchange or refresh
credentials; an authenticated client whose owner is deleted fails as
`invalid_client` before grant validation, regardless of participant UUID order. A valid client
receives a successful no-op revocation for a deleted grant subject. Bearer validation rejects both
deleted subjects and clients with deleted owners. Pending consent cannot be approved or resumed
after its client owner is deleted, and no new authorization can begin for that client.

The deletion worker revokes owned clients, the subject's grants, and each grant's token families,
access tokens, and refresh tokens in separate bounded pages. An owned client's other users' grants
are not traversed; the client revocation already makes them unusable. Newly revoked families emit
one immutable `refresh_family_revoked` event each, in the same transaction as the mutation. Retries
preserve existing revocation timestamps and do not duplicate events. Finalization independently
checks all five active credential types, including unrevoked expired children beneath revoked
parents. Hard user deletion leaves revoked clients with `owner_user_id = NULL` for provenance and
retains append-only OAuth evidence. The [account-deletion requirements](../users/ACCOUNT-DELETION-DATA-REQUEST.md#deletion-cascade)
describe the surrounding lifecycle.

## Protected resources and discovery

- Two protected resources share the site origin: the user MCP server (`/api/v1/mcp`) and the admin
  MCP server (`/api/v1/admin/mcp`). Every consent request, code, grant, and token binds to exactly
  one of them, and each MCP route accepts only tokens bound to itself.
- The issuer is the configured site origin, never the request `Host`. Authorization responses,
  including errors, carry the RFC 9207 `iss` parameter.
- Discovery documents are anonymous and publicly cacheable:
  - RFC 8414 authorization-server metadata at `/.well-known/oauth-authorization-server` advertises
    `client_id_metadata_document_supported: true`.
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
  so a client registered for `mcp.user:write` may request `cards:write`. Exact private delegation
  grants are the exception: `post-relations.owned-private:write` must be registered and requested
  literally, with its relation prerequisites.

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

## Related

- [Authentication architecture](../../overview/architecture/auth-overview.md)
- [Security requirements](./SECURITY.md)
- [API routes](../../../backend/api/oauth/README.md)
- [Authorization-server service](../../../backend/services/oauth-authorization-server/README.md)
