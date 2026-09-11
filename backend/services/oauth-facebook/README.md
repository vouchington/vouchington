# @services/oauth-facebook

Facebook OAuth provider — exchanges short-lived tokens for long-lived tokens, fetches the user profile, and upserts OAuth accounts.

## Key exports

- `upsertFacebookAccount(accessToken, options)` — exchanges the short-lived token for a long-lived token, fetches the Facebook user profile, and upserts the OAuth account record
- `upsertFacebookAuthorizationCodeAccount(code, redirectUri, options)` — exchanges a
  server-broker authorization code, upgrades the resulting token, and atomically completes the
  fenced authorization row with provider-account persistence

Facebook's web authorization endpoint does not advertise the RFC 7636 S256 parameters used by X
and GitHub, so the broker does not send an unmatched verifier. HMAC-bound state, confidential
server-side code exchange, the web HttpOnly completion cookie, and the native app-held completion
proof protect the remaining boundaries.

## Related

- Parent: [../CLAUDE.md](../CLAUDE.md)
- OAuth service: [../oauth/README.md](../oauth/README.md)
- Auth overview: [../../../docs/overview/architecture/auth-overview.md](../../../docs/overview/architecture/auth-overview.md)
- Auth requirements: [../../../docs/requirements/security/AUTH.md](../../../docs/requirements/security/AUTH.md)
