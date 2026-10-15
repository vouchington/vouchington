# @services/oauth-linkedin

Source entrypoint: [backend/services/oauth-linkedin/README.md](../../../../../backend/services/oauth-linkedin/README.md)

LinkedIn OAuth provider — exchanges authorization codes, fetches the userinfo endpoint, and upserts OAuth accounts. Web redirects supply PKCE; the server-begun broker uses a confidential client exchange and retains its separate native completion proof.

## Key exports

- `upsertLinkedInAccount(code, redirectUri, codeVerifier, options)` — exchanges an authorization code for a LinkedIn access token, including the web PKCE verifier when supplied. Broker callers omit that provider verifier and pass a bounded abort signal plus an exact authorization/claim pair so account persistence and completion readiness commit atomically.

## Related

- Parent: [../AGENTS.md](../../../../../backend/services/AGENTS.md)
- OAuth service: [../oauth/README.md](../oauth/README.md)
- Auth requirements: [../../../docs/requirements/security/AUTH.md](../../../../requirements/security/AUTH.md)
