# @services/oauth-microsoft

Microsoft OAuth provider — exchanges authorization codes with PKCE via the Microsoft identity platform, fetches Graph API user data, and upserts OAuth accounts.

## Key exports

- `upsertMicrosoftAccount(code, codeVerifier, options)` — exchanges the PKCE authorization code, fetches the Microsoft Graph `/me` user profile, and upserts the OAuth account record

## Related

- Parent: [../CLAUDE.md](../CLAUDE.md)
- OAuth service: [../oauth/README.md](../oauth/README.md)
- Auth requirements: [../../../docs/requirements/security/AUTH.md](../../../docs/requirements/security/AUTH.md)
