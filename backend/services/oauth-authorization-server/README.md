# OAuth authorization server

Voucha issues delegated, opaque OAuth credentials for user-facing MCP and API clients. This package
is deliberately separate from `@services/oauth`, which consumes social providers for Voucha login
and account linking.

## Protocol surface

- Authorization code with mandatory S256 PKCE and rotating refresh-token support.
- Rotating refresh tokens with family-wide revocation when a token is reused.
- Public RFC 7591 client registration and confidential clients using HTTP Basic authentication.
- Exact redirect URI, resource, and canonical scope binding.
- Opaque codes and tokens stored only as purpose-bound hashes.

Confidential client secrets are also stored as nonrecoverable, purpose-bound hashes. The server
does not need to recover them: it verifies the one-time registration response on later token and
revocation requests.

Implicit, password, client-credentials, OIDC, ID-token, UserInfo, and plain-PKCE flows are not
supported.

## Library evaluation

`oidc-provider` was rejected because B1 does not require OIDC and its discovery, provider-session,
JWKS, ID-token, and UserInfo surfaces would overlap later work. `@node-oauth/oauth2-server` 5.3 was
evaluated as the smaller OAuth-only option, but its grant handlers call credential revocation and
replacement persistence through separate model callbacks. Those callbacks cannot share one
PostgreSQL transaction, so the library cannot enforce Voucha's single-winner code exchange and
refresh-family reuse invariants. The narrow supported protocol is implemented here with explicit
row locks and transactions instead.

## Persistence

`oauth_clients` owns validated dynamic client metadata. Pending browser requests, durable grants,
append-only consent-decision evidence, single-use authorization codes, opaque access tokens, and
rotating refresh-token families live in their own typed tables. Consent evidence intentionally has
no identity foreign keys so retention, account deletion, and client deletion cannot erase it. Codes
and token strings are returned once and never persisted in plaintext.

Code exchange locks the code row before validating and atomically writes its token family. Refresh
rotation locks the family and presented token before consuming it and creating one successor. Reuse
revokes the family and every access token derived from it. Every access token has a non-null,
composite foreign key to the same grant and refresh family, so cross-grant revocation state is
unrepresentable. Suspended grant owners cannot exchange, refresh, or authenticate credentials.

## Boundaries

This package exports bearer validation for later protected-resource work. B2 owns well-known
metadata and `WWW-Authenticate`; B15 owns client and grant management UX.
