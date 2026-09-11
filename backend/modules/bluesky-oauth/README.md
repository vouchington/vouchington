# @modules/bluesky-oauth

Wraps the `@atproto/oauth-client-node` SDK — the AT Protocol (Bluesky) OAuth client, handling
DPoP, PAR, and authorization-server metadata discovery internally. This module owns only the SDK
boundary; it has no database or Valkey dependency of its own.

## What lives here

- `client-metadata.mts` — the single source of truth for this app's OAuth client metadata
  (`client_id`, `redirect_uris`, scope, `token_endpoint_auth_method: 'private_key_jwt'`, the
  inline `jwks`, ...). Both the `GET /client-metadata.json` route and `createBlueskyOAuthClient`
  import this function (and the same `getBlueskyKeyset()` singleton), so the document served to
  authorization servers and the metadata the client validates itself against can never drift
  apart.
- `keyset.mts` — loads the `private_key_jwt` signing keyset (ES256 / EC P-256) from
  `VOUCHA_BLUESKY_JWT_PRIVATE_KEYS_B64`, falling back to a bundled test key outside production.
  Builds an `@atproto/jwk` `Keyset` of `@atproto/jwk-jose` `JoseKey`s — the shape both
  `NodeOAuthClient`'s `keyset` option and `Keyset#toJSON()` (embedded in the served metadata as
  `jwks`) need. `toJSON()` is used over the `publicJwks` getter because it returns a plain mutable
  object matching `OAuthClientMetadataInput['jwks']`'s type, rather than `publicJwks`'s
  `Readonly<...>` shape.
- `create-client.mts` — the `no-mistakes: integration=bluesky`-tagged
  `createBlueskyOAuthClient({ stateStore, sessionStore })` constructs a `NodeOAuthClient`. The
  state/session store implementations are injected by
  `@services/bluesky-accounts`, which owns the actual `bluesky_linked_accounts` table — this
  module never touches Postgres or Valkey directly.
- `authorize.mts` / `callback.mts` / `revoke.mts` / `restore.mts` — thin, individually
  `no-mistakes: integration=bluesky`-tagged wrappers around the client's `authorize()`,
  `callback()`, `revoke()`, and `restore()` methods (the OAuth flow's four external-network call
  sites).

## Why `token_endpoint_auth_method: 'private_key_jwt'`

The client is confidential, not public: `createBlueskyOAuthClient` signs token requests with a
private ES256 key only this app holds (see `keyset.mts`), and the corresponding public JWKS is
embedded inline in the served client metadata as `jwks` (`@atproto/oauth-client`'s
`validateClientMetadata` accepts either an inline `jwks` or a `jwks_uri`; inline avoids a second
public route). This buys the confidential-client refresh-token lifetime AT Protocol authorization
servers grant — a `'none'` (public) client's refresh tokens are more tightly scoped and
shorter-lived, since the AS has no way to verify a token-refresh request actually came from this
app rather than anyone who obtained a stored refresh token. See
[keyset.mts](keyset.mts) for the algorithm choice (ES256, matching `@atproto/jwk`'s and
`@atproto/jwk-jose`'s own defaults) and
[docs/overview/infrastructure/environment-variables.md](../../../docs/overview/infrastructure/environment-variables.md)
for how the signing key is provisioned.

## No distributed lock

No cross-instance lock utility exists in this codebase yet. `createBlueskyOAuthClient` omits
`requestLock`, so the SDK falls back to its default in-process lock (logging a one-time warning).
This is a real, if narrow, session-loss risk, not merely a wasted call: if two processes refresh
the same DID's session concurrently and the authorization server rotates refresh tokens (standard
OAuth behavior), the loser's stale-refresh-token-derived write can overwrite the winner's freshly
rotated session in `SessionStore` — and an AS that additionally does refresh-token-reuse detection
can then revoke both tokens, permanently invalidating that DID's link and forcing the user to
re-link. A real distributed lock would close this, but every Bluesky-token-touching queue job this
codebase adds is required to run at worker concurrency 1, which already removes the only
multi-process writer this app controls; the remaining exposure is a concurrent interactive request
racing a queue job, judged rare enough that the lock is a documented follow-up rather than a
Phase D blocker.

## Network address support

OAuth provider domains that resolve to public IPv4 addresses are supported. Requests use the
application egress dispatcher plus the SDK's `unicastFetchWrap`, which resolves hostnames before
connecting and rejects loopback, private, link-local, and other non-public destinations. This
applies to both literal addresses and domain names: for example, `127.0.0.1` and a `localhost`
hostname resolving to it are both rejected. Public IPv6 addresses use the same validation path;
actual reachability still depends on the deployed worker network having an IPv6 route.

## See also

- `@services/bluesky-accounts` — the `bluesky_linked_accounts` table, the `StateStore`/
  `SessionStore` implementations, and the account-linking service functions that call this module.
- [docs/overview/architecture/fediverse-federation.md](../../../docs/overview/architecture/fediverse-federation.md) — Phase D section.
