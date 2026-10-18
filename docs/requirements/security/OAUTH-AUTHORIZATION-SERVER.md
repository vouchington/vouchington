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

The shared OAuth protocol package owns protocol parsing, validation, discovery, and response
construction. Voucha supplies its scope catalog, resource resolver, client registry, and secret
hashing policy. Token exchange and revocation remain in the app service so participant deletion
locks, client authentication, grant mutation, and replay-family revocation share the required
transaction order. Refresh downscoping uses scopes explicitly held by the token; catalog-implied
coverage may authorize a new request but does not enlarge an existing token grant.

## Security invariants

- Redirect URIs use exact registration matching except port-less HTTP loopback IP registrations,
  which accept any port on `127.0.0.1` or `[::1]` with every other byte unchanged. HTTPS and
  `localhost` registrations remain exact. The token endpoint always matches the authorization
  request's redirect URI exactly, including its requested port.
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
  lifecycle evidence that survives short-lived credential retention and identity deletion. Each event
  references the grant owner's retained user identity with `ON DELETE RESTRICT`, so the identity root
  stays for as long as the append-only events do.
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
authenticate with HTTP Basic and a generated client secret. Voucha implements RFC 7591 registration,
not RFC 7592 registration management, so it mints no unused management credential. Signed-in owners and administrators manage clients and grants through the
first-party routes below instead.

Signed-in users register and manage their own clients through `/api/v1/my/oauth-apps`
(OAuth apps). Owner registration reuses the RFC 7591 validators
and records `owner_user_id`; rotation replaces the stored client-secret hash and returns the new
secret once, and renaming a client or replacing its redirect URIs clears `verified_at` and
`verified_by_id` in the same update. Every owner mutation first takes the account-deletion lock
(`fn_lock_active_user_for_mutation`), so a request that authenticated just before the owner's
deletion committed cannot change the app or mint a secret afterwards. Account deletion revokes
the apps the account owns in bounded worker batches.

### Client ID Metadata Documents

An HTTPS URL with a path may be used directly as `client_id`. The metadata is fetched through the
SSRF-safe, DNS-pinned boundary with no redirects, strict size and time budgets, and must name its
own URL. These clients are public and secretless and still require S256 PKCE. Consent always shows
the URL hostname, and shows a display name only when the exact URL is in the reviewed
`known-clients.mts` list, because a document's mutable name must never be trusted for display.
A failed or invalid refresh aborts authorization rather than falling back to stale metadata.

### First-party native clients

Native agents use the same authorization code with S256 PKCE flow to call the user MCP resource,
with the same scope checks, rate limits, quota, and audit as every other MCP client. Consent always
applies. Every mutating user-MCP tool requires a paid plan, so a Free member's native agent gets
read tools only. Their exact client ids and redirect URIs live in code, so first-party clients
resolve without a self-fetch; loopback redirects accept any port while the token endpoint matches
the authorization request exactly.

## Persistence and retention

Durable clients, grants, and append-only authorization lifecycle events are kept separately from
short-lived consent requests, codes, and tokens, so retention can prune expired protocol artifacts
while preserving consent and revocation evidence. Clients are retired through `revoked_at` and
never deleted, because [content provenance](../content/content-provenance.md) references the
client that created each row. A client's verification decides whether a public provenance label may
name it.

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

Missing or invalid credentials get a standard `401` with a resource-metadata challenge, and a call
that fails only on a missing scope gets `403 insufficient_scope` naming the granted plus required
scopes so re-consent never drops access already held. Role and plan denials, batches, and API keys
keep in-band JSON-RPC errors because re-consent cannot fix them. Every call a verified token makes
is written to an append-only audit table before it runs, and the request fails closed if the audit
row cannot be stored. See the
[MCP tools architecture](../../overview/architecture/services/README.md).

## Related

- [Authentication architecture](../../overview/architecture/auth-overview.md)
- [Security requirements](./SECURITY.md)
- [API design decisions](../api/README.md)
- [Authorization-server service](../../overview/architecture/services/README.md)
