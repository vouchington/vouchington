# @services/oauth-apple

Apple Sign-In OAuth provider — verifies Apple identity JWTs and upserts OAuth accounts.

## Authentication contract

Apple supplies a sensitive `id_token`. This service verifies the JWT signature, expiry, issuer,
and audience in-process using Apple's JWKS, then upserts the account keyed by the token's `sub`
claim. When the caller supplies the expected nonce, the service also requires and verifies the
token's nonce claim. It does not exchange an Apple authorization code or call a provider token
endpoint.

Separately issued, unexpired identity tokens for the same `sub` converge on the same provider
account when each token satisfies its own nonce binding. This does not define a credential-replay
contract: clients must preserve the nonce validation flow and treat every identity token as
sensitive. Apple supplies profile names only with the initial authorization response, so account
upserts atomically merge newly supplied profile fields into stored Apple user data instead of
erasing a name when a restarted sign-in omits `userData`.

Apple JWKS requests use the provider-scoped API egress transport. The runtime flag selects either a
direct guarded request or the HTTP CONNECT proxy; a failed proxied request never falls back to a
second direct attempt.

## Key exports

- `upsertAppleAccount(idToken, options)` — verifies the Apple identity token (JWT signature, expiry, issuer, audience, and the nonce when supplied) and upserts the OAuth account record
- `getAppleAccountByAppleUserId(appleUserId)` — retrieves an OAuth account by the Apple user identifier

## Related

- Parent: [../CLAUDE.md](../CLAUDE.md)
- OAuth service: [../oauth/README.md](../oauth/README.md)
- Auth overview: [../../../docs/overview/architecture/auth-overview.md](../../../docs/overview/architecture/auth-overview.md)
- Auth requirements: [../../../docs/requirements/security/AUTH.md](../../../docs/requirements/security/AUTH.md)
