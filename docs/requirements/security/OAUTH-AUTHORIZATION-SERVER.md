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

## Ownership boundaries

This foundation issues and validates credentials and binds them to a requested resource. Protected-
resource discovery, `WWW-Authenticate` challenges, per-tool scope enforcement, and the public
developer experience are layered follow-up work.

## Related

- [Authentication architecture](../../overview/architecture/auth-overview.md)
- [Security requirements](./SECURITY.md)
- [API routes](../../../backend/api/oauth/README.md)
- [Authorization-server service](../../../backend/services/oauth-authorization-server/README.md)
