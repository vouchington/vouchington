# OAuth authorization server

Source entrypoint: [backend/services/oauth-authorization-server/README.md](../../../../../backend/services/oauth-authorization-server/README.md)

Voucha issues delegated, opaque OAuth credentials for user-facing MCP and API clients. This package
is deliberately separate from `@services/oauth`, which consumes social providers for Voucha login
and account linking.

## Protocol surface

- Authorization code with mandatory S256 PKCE and rotating refresh-token support.
- Rotating refresh tokens with family-wide revocation when a token is reused.
- Public RFC 7591 client registration and confidential clients using HTTP Basic authentication.
- HTTPS Client ID Metadata Documents for public clients, with exact identifier and redirect-string
  matching, mandatory S256 PKCE, and discovery advertisement.
- Exact redirect URI, resource, and canonical scope binding, with RFC 8707 `resource` checks at
  the token endpoint and the RFC 9207 `iss` parameter on every authorization response.
- Two protected resources, the user and admin MCP servers (`resources.mts`), with RFC 8414 and
  RFC 9728 metadata builders. Only administrators may authorize the admin resource
  (`resource-authorization.mts`).
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

`oauth_clients` owns validated dynamic and Client ID Metadata Document client metadata. Pending browser requests, durable grants,
append-only consent-decision evidence, single-use authorization codes, opaque access tokens, and
rotating refresh-token families live in their own typed tables. Consent evidence intentionally has
no identity foreign keys so retention, account deletion, and client deletion cannot erase it. Codes
and token strings are returned once and never persisted in plaintext.

For a URL client identifier, `client-id-metadata-document.mts` requires an HTTPS URL with a path,
rejects userinfo, fragments, dot segments, private and special-use addresses, and every redirect.
DNS resolution and response headers have a 5-second budget, body reads have a separate 5-second
budget, and documents are limited to 5 KiB. The fetched `client_id` and redirect URI strings are
compared exactly. Shared-secret authentication, shared secrets, and private JWK material are
rejected.

Valid metadata is stored in the same relational client row used by grants, tokens, and provenance.
`metadata_expires_at` follows response cache headers with a 5-minute default and 1-hour ceiling;
response age is subtracted, and `no-cache` or `no-store` makes the row immediately stale for new
authorizations. Failed and invalid responses never replace stored metadata. Concurrent refreshes
receive database-ordered generations and record their fetch-start times, so an older refresh that
finishes later cannot overwrite newer validated metadata.

Code exchange locks the code row before validating and atomically writes its token family. Refresh
rotation locks the family and presented token before consuming it and creating one successor. Reuse
revokes the family and every access token derived from it. Every access token has a non-null,
composite foreign key to the same grant and refresh family, so cross-grant revocation state is
unrepresentable. Suspended grant owners cannot exchange, refresh, or authenticate credentials.

## Management

`grant-management.mts` lists a user's unrevoked grants on live clients (newest first, keyset paged
by grant id) and revokes one owner-scoped grant with a single conditional update.
`app-management.mts` registers, renames, re-points, rotates and revokes owner apps with
owner-scoped statements inside the owner's active-user lock; a changed name or redirect-URI set
clears staff verification. Consent decisions and code exchange recheck, in the same statement that
share-locks the client row, that the client is live and the request's redirect URI is still
registered, so re-pointing an app retires the removed URI even for requests already in flight.
Code exchange, refresh and revocation authenticate the client with `authenticateLockedOAuthClient`,
which checks the secret against the share-locked row, so rotating a secret or revoking an app
serializes with in-flight token requests and the replaced secret stops working once rotation
returns.
Account deletion fences consenting users and app owners before OAuth artifact locks are acquired;
the protocol paths recheck both under sorted shared lifecycle locks, while deletion and owned-app
mutation take exclusive locks. `deletion.mts` revokes the deleted user's owned clients and own grant
descendants in bounded transactional pages. The final deletion
residual check keeps the request open until every active OAuth credential is retired. See the
[account-deletion security contract](../../../../requirements/security/OAUTH-AUTHORIZATION-SERVER.md#account-deletion)
for error behavior, audit retention, and ownership boundaries.
`client-metadata-validation.mts` holds the RFC 7591 metadata validators that dynamic registration
and owner apps share. `client-verification.mts` lists active dynamically registered clients for
administrators and verifies the exact reviewed `client_name` and `redirect_uris` with one
conditional update, or clears verification. Management views live in `management-types.mts`.
The verified listing uses a static `verified_at IS NOT NULL` predicate and separate first-page and
continuation queries so generic prepared plans can apply the cursor through
`idx_oauth_clients__verified_active_id`; the all and unverified listings intentionally have no
speculative indexes.

## Boundaries

This package exports bearer validation, resource definitions, and discovery metadata. The MCP
routes build `WWW-Authenticate` challenges in `@services/mcp-tools`. See the
[OAuth requirements](../../../../requirements/security/OAUTH-AUTHORIZATION-SERVER.md).
