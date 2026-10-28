# API Keys

API keys give programmatic access to features that need authentication: RSS feeds (read-only, key in
the query string) and eligible MCP servers (bearer token). An MCP API key belongs to one server
audience; changing the audience while creating a key clears previously selected permissions.
OAuth apps may offer permissions from several server audiences, while each authorization request
and access token remains bound to one protected resource.

## Decisions

- **Admin MCP is OAuth-only.** The admin MCP endpoint accepts only OAuth access tokens bound to the
  admin resource and owned by a current administrator; an API key there gets the same `401` as any
  unrecognized credential. API keys never carry admin-audience scopes. See the
  [OAuth authorization server](../security/OAUTH-AUTHORIZATION-SERVER.md#protected-resources-and-discovery)
  and the [MCP tools architecture](../../overview/architecture/services/README.md).
- **RSS works without a key.** Unkeyed requests rate-limit by client IP; a keyed request is
  validated and rate-limits by key identity.
- **Raw keys are never stored.** Only hashes are persisted, a checksum is verified before any
  database lookup, and revocation is immediate. Revoked and expired keys are deleted after 90 days;
  retained key identities preserve references from the bounded MCP security audit.
- **RSS keys are bearer credentials in URLs.** Keyed RSS responses are `Cache-Control: private` with
  `Referrer-Policy: no-referrer`, and users should revoke keys that appear in logs or shared URLs.
- **MCP calls are audited before they run**, under the key id, owner, tool and outcome, never the
  arguments, results or raw key. A call that cannot be recorded fails closed, and deleting the owner
  keeps the audit rows.

## Related

- [API keys service](../../overview/architecture/services/README.md)
- [API keys service rules](../../../backend/services/api-keys/AGENTS.md)
