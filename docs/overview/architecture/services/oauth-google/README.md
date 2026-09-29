# @services/oauth-google

Source entrypoint: [backend/services/oauth-google/README.md](../../../../../backend/services/oauth-google/README.md)

Google OAuth provider — verifies Google credential JWTs and upserts OAuth accounts.

## Key exports

- `upsertGoogleAccount(credential, options)` — verifies the Google ID token (signature, expiry, issuer, audience) and upserts the OAuth account record
- `getGoogleAccountByGoogleUserId(googleUserId)` — retrieves an OAuth account by the Google user identifier

## Related

- Parent: [../AGENTS.md](../../../../../backend/services/AGENTS.md)
- OAuth service: [../oauth/README.md](../oauth/README.md)
- Auth overview: [../../../docs/overview/architecture/auth-overview.md](../../auth-overview.md)
- Auth requirements: [../../../docs/requirements/security/AUTH.md](../../../../requirements/security/AUTH.md)
