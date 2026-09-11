# @services/oauth-github

GitHub OAuth provider — exchanges authorization codes for access tokens, fetches user data, and upserts OAuth accounts.

## Key exports

- `upsertGithubAccount(code, redirectUri, options)` — exchanges the authorization code for a GitHub
  access token, optionally supplies the broker's PKCE verifier, fetches the GitHub user profile and
  primary email, and upserts the OAuth account record. Broker options atomically advance the fenced
  authorization row.

The provider-scoped egress flag selects the guarded direct transport or HTTP CONNECT proxy for the
token, `/user`, and `/user/emails` requests. A timeout may occur after GitHub consumes the one-time
code, so ambiguous failures require a fresh authorization rather than a transport fallback.

## Related

- Parent: [../CLAUDE.md](../CLAUDE.md)
- OAuth service: [../oauth/README.md](../oauth/README.md)
- Find your friends system: [../../queues/find-your-friends/README.md](../../queues/find-your-friends/README.md)
- Auth requirements: [../../../docs/requirements/security/AUTH.md](../../../docs/requirements/security/AUTH.md)
