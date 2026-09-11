# @services/oauth-x

X (Twitter) OAuth 2.0 provider — exchanges authorization codes with PKCE, fetches the user profile, and upserts OAuth accounts.

## Key exports

- `upsertXAccount(code, redirectUri, codeVerifier, options)` — exchanges the PKCE authorization
  code for an X access token, fetches the X user profile, and upserts the OAuth account record.
  Broker options atomically advance the fenced authorization row.

The provider-scoped egress flag selects the guarded direct transport or HTTP CONNECT proxy. The
broker has the stricter upstream-code lifetime contract: exchange must start
within ten seconds of callback persistence and the entire token/profile operation has one
15-second abort signal. A row that misses the queue-start budget becomes `rejected` instead of
pretending a later dispatcher run can recover the 30-second X code. A timeout may occur after X
consumed the one-time code; any token-exchange uncertainty or post-exchange profile failure before
atomic account persistence is accepted loss unless a future provider primitive makes that phase
resumable.

## Related

- Parent: [../CLAUDE.md](../CLAUDE.md)
- OAuth service: [../oauth/README.md](../oauth/README.md)
- Find your friends system: [../../queues/find-your-friends/README.md](../../queues/find-your-friends/README.md)
- Auth requirements: [../../../docs/requirements/security/AUTH.md](../../../docs/requirements/security/AUTH.md)
