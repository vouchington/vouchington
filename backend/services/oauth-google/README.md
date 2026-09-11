# @services/oauth-google

Google OAuth provider — verifies Google credential JWTs and upserts OAuth accounts.

## Key exports

- `upsertGoogleAccount(credential, options)` — verifies the Google ID token (signature, expiry, issuer, audience) and upserts the OAuth account record
- `getGoogleAccountByGoogleUserId(googleUserId)` — retrieves an OAuth account by the Google user identifier

## Related

- Parent: [../CLAUDE.md](../CLAUDE.md)
- OAuth service: [../oauth/README.md](../oauth/README.md)
- Auth overview: [../../../docs/overview/architecture/auth-overview.md](../../../docs/overview/architecture/auth-overview.md)
- Auth requirements: [../../../docs/requirements/security/AUTH.md](../../../docs/requirements/security/AUTH.md)
