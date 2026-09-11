# @services/oauth-linkedin

LinkedIn OAuth provider — exchanges authorization codes with PKCE, fetches the userinfo endpoint, and upserts OAuth accounts.

## Key exports

- `upsertLinkedInAccount(code, codeVerifier, options)` — exchanges the PKCE authorization code for a LinkedIn access token, fetches the LinkedIn userinfo, and upserts the OAuth account record

## Related

- Parent: [../CLAUDE.md](../CLAUDE.md)
- OAuth service: [../oauth/README.md](../oauth/README.md)
- Auth requirements: [../../../docs/requirements/security/AUTH.md](../../../docs/requirements/security/AUTH.md)
