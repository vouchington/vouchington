# @services/oauth-linkedin

Source entrypoint: [backend/services/oauth-linkedin/README.md](../../../../../backend/services/oauth-linkedin/README.md)

LinkedIn OAuth provider — exchanges authorization codes with PKCE, fetches the userinfo endpoint, and upserts OAuth accounts.

## Key exports

- `upsertLinkedInAccount(code, codeVerifier, options)` — exchanges the PKCE authorization code for a LinkedIn access token, fetches the LinkedIn userinfo, and upserts the OAuth account record

## Related

- Parent: [../AGENTS.md](../../../../../backend/services/AGENTS.md)
- OAuth service: [../oauth/README.md](../oauth/README.md)
- Auth requirements: [../../../docs/requirements/security/AUTH.md](../../../../requirements/security/AUTH.md)
