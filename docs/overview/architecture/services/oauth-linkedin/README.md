# @services/oauth-linkedin

Source entrypoint: [backend/services/oauth-linkedin/README.md](../../../../../backend/services/oauth-linkedin/README.md)

LinkedIn OAuth provider — exchanges authorization codes with PKCE, fetches the userinfo endpoint, and upserts OAuth accounts.

## Key exports

- `upsertLinkedInAccount(code, redirectUri, codeVerifier, options)` — exchanges the PKCE authorization code for a LinkedIn access token, fetches LinkedIn userinfo, and upserts the OAuth account. Broker callers pass a bounded abort signal and an exact authorization/claim pair so account persistence and completion readiness commit atomically.

## Related

- Parent: [../AGENTS.md](../../../../../backend/services/AGENTS.md)
- OAuth service: [../oauth/README.md](../oauth/README.md)
- Auth requirements: [../../../docs/requirements/security/AUTH.md](../../../../requirements/security/AUTH.md)
