# API Keys

API keys provide programmatic access to Voucha features that require authentication, including RSS feeds and MCP clients.

## Key Types

| Type  | Description                                      |
| ----- | ------------------------------------------------ |
| `rss` | RSS feed access (read-only, URL query parameter) |
| `mcp` | User MCP server access (Bearer token, HTTP POST) |

Administrator MCP access is not an API-key type; see [Admin MCP is OAuth-only](#admin-mcp-is-oauth-only).

## Key Format

All keys follow `voucha_<type>_<32 hex random>_<16 hex HMAC checksum>`, for example `voucha_rss_a1b2c3d4e5f6789012345678abcdef01_a3f29c7e4d8b1f05`.

- **Brand prefix**: `voucha_`
- **Type segment**: `rss` (typed enum, extensible)
- **Random**: 16 bytes → 32 lowercase hex chars (128-bit entropy)
- **Checksum**: first 16 hex chars of `HMAC-SHA256(API_KEY_CHECKSUM_SECRET, "voucha_<type>_<random>")`
- **Display prefix**: `voucha_${type}_${random.slice(0, 4)}` (e.g. `voucha_rss_a1b2`)

Keys are stored as SHA-256 hashes and cannot be recovered after creation. The raw key is shown exactly once at creation time.

## Permissions

API keys use a permission-based access control system. Each key has a `permissions` array that determines what it can access.

### Available Permissions

| Permission                                 | Description                                                                |
| ------------------------------------------ | -------------------------------------------------------------------------- |
| `rss:read`                                 | Access RSS feed endpoints (`/rss/posts`, `/rss/news`)                      |
| `topics:read`                              | Read topic and recommendation MCP tools                                    |
| `posts:read`                               | Read post MCP tools                                                        |
| `communities:read`                         | Read public community MCP tools                                            |
| `cards:read/write`                         | Read or manage cards; write requires read                                  |
| `entity-relations:read/write`              | Read or add relations; write requires read                                 |
| `bookmarks:read/write`, `lists:read/write` | Set bookmarks or manage lists and items; write requires read               |
| `post-relations.owned-private:write`       | Add relations, tags, bookmarks, or list items for owned private posts only |
| `financial-profile:read/write`             | Credit score, income, credit limit and history; exact grants               |
| `spending:read/write`                      | Spending categories, amounts, frequency and notes; exact grants            |
| `mcp.user:read/write`                      | User MCP access excluding exact-grant permissions                          |

Scopes use the strict lowercase `<resource>:<action>` grammar. Dot-delimited resources compose the
surface and audience, such as `mcp.user` and `mcp.admin`. Unknown, whitespace-padded, case-normalized,
duplicate, or write-without-read scope sets are rejected. RSS keys accept only `rss:read`; MCP keys
accept only user-audience scopes. Admin-audience scopes (`mcp.admin:read`, `mcp.admin:write`) are
OAuth-only: `POST /api/v1/my/api-keys` rejects them with `400` for every owner, administrators
included. OAuth access tokens are the alternative MCP credential. Each grant binds to one protected resource,
so its scopes also belong to that resource's audience; see the
[OAuth authorization server](../security/OAUTH-AUTHORIZATION-SERVER.md#protected-resources-and-discovery).
Only user- and admin-audience scopes accept the `oauth` surface, and the admin-audience scopes accept
nothing else. `rss:read` is API-key only, because no OAuth protected resource serves the RSS feeds.

### Scope catalogue

`GET /api/v1/scopes` lists every canonical scope with its resource, action, audience, prerequisite
(`requires`), the credential surfaces (`api-key`, `oauth`) that accept it, and an optional stable
description key. The MCP user and administrator umbrella resources have different description
keys. Each client resolves those keys through its typed localization catalogue instead of deriving
the audience label or rendering server-owned English copy. Web and native pickers consume this
catalogue rather than hard-coding scope strings; see the
[client parity matrix](../CLIENT-PARITY-MATRIX.md#api-key-and-connected-app-contract-handoff).
See the [Scopes API](../api/v1/scopes/README.md).
`financial-profile:*` and `spending:*` require explicit grants; `mcp.user:*` excludes them. `get_my_financial_profile` requires `financial-profile:read`; `get_my_profile` omits financial data. Each write requires its read scope. Pickers describe each permission; consent separates exact grants as sensitive permissions.
MCP keys are user MCP only. The own-private relation capability is visible as a separate picker permission, not part of Standard MCP access. Selecting it also selects its relation write and read prerequisites. The picker explains that it lets the credential add relations and tags only to the holder's own private posts.

## Endpoints

### Management (authenticated via session)

| Method   | Path                      | Description          |
| -------- | ------------------------- | -------------------- |
| `GET`    | `/api/v1/my/api-keys`     | List your API keys   |
| `POST`   | `/api/v1/my/api-keys`     | Create a new API key |
| `DELETE` | `/api/v1/my/api-keys/:id` | Revoke an API key    |

### OAuth apps and connected apps

Owned OAuth apps and the grants users approved are documented in
[OAuth Apps and Connected Apps](oauth-apps.md).

### RSS Feeds (API key optional)

| Method | Path         | Description                      |
| ------ | ------------ | -------------------------------- |
| `GET`  | `/rss/posts` | RSS feed of user-generated posts |
| `GET`  | `/rss/news`  | RSS feed of external news items  |

### MCP Servers

| Method | Path                | Description               |
| ------ | ------------------- | ------------------------- |
| `POST` | `/api/v1/mcp`       | User MCP Streamable HTTP  |
| `POST` | `/api/v1/admin/mcp` | Admin MCP Streamable HTTP |

RSS feeds are accessible without an API key. When no key is provided, rate limiting uses the client IP address. When a key is provided, it must be passed as `apikey` in the query string, is validated, and rate limiting uses the API key identity.

## Admin MCP is OAuth-only

`POST /api/v1/admin/mcp` accepts only OAuth access tokens; an API key sent there gets `401` like any
other unrecognized bearer credential. The token must be valid (unexpired, unrevoked, from an
unrevoked grant and client), belong to a current administrator, be bound to the admin protected
resource, and carry the scope each tool declares (`mcp.admin:read` or `mcp.admin:write`). See the
[OAuth authorization server](../security/OAUTH-AUTHORIZATION-SERVER.md#protected-resources-and-discovery)
and the [MCP tools architecture](../../overview/architecture/services/mcp-tools/README.md#mcp-audit-log)
for the per-call audit log.

## Rate Limits

RSS feed endpoints are rate-limited to **3 requests per minute** per identity per route, AND per IP address per route. Both limits must pass. The 4th request within a 60-second window is rejected with 429. Identity is the API key ID (when provided) or `anon:{ip}` (when no key is provided).

## Usage

### Creating an API Key

1. Go to Settings > API Keys (`/my/api-keys`)
2. Click "Create API Key"
3. Choose an RSS feed or MCP server key, pick the MCP key's scopes, then enter a label. The label
   example follows the chosen key type, such as an RSS reader for RSS or an MCP client for MCP.
4. Copy the raw key immediately (it won't be shown again)

An RSS key always carries `rss:read`. An MCP key's scope picker renders the
[scope catalogue](#scope-catalogue) entries that accept the `api-key` surface, one row per resource
with read and write checkboxes and the `mcp.<audience>` umbrella row first. Checking a scope also
checks its `requires` prerequisite, and unchecking a prerequisite drops the scopes that need it, so
the picker never sends a set the API rejects. The picker lists user-audience scopes only, for
administrators as well, so no audience choice is shown. Create stays disabled until the label and at
least one scope are set.

### Using with RSS Feeds

Append `apikey=YOUR_KEY` to the query string:

```text
/rss/posts?topics=artificial-intelligence&post_type=discussion&apikey=voucha_rss_abc1...
/rss/news?topics=artificial-intelligence&apikey=voucha_rss_abc1...
/rss/posts?user=johndoe&apikey=voucha_rss_abc1...
```

### Query Parameters

#### `/rss/posts`

| Param       | Description                                          |
| ----------- | ---------------------------------------------------- |
| `topics`    | Comma-separated topic slugs                          |
| `post_type` | Filter by type: `discussion`, `review`, `data_point` |
| `user`      | Filter by username                                   |
| `apikey`    | API key (optional — improves rate limit identity)    |

#### `/rss/news`

| Param     | Description                                               |
| --------- | --------------------------------------------------------- |
| `topics`  | Comma-separated topic slugs to filter news items by topic |
| `sources` | Comma-separated topic slugs to filter by RSS feed source  |
| `apikey`  | API key (optional — improves rate limit identity)         |

## Security

- Raw keys are never stored; only SHA-256 hashes are persisted
- Keys include an HMAC-SHA256 checksum that is verified before any DB lookup
- A bloom filter provides a fast-path rejection for unknown keys
- Keys can be revoked instantly via the settings page or API by setting `revoked_at`; validation ignores revoked rows
- `last_used_at` is tracked for monitoring
- Revoked keys retain an audit trail but are immediately invalid. Every user MCP call made with a key is recorded before it runs in `mcp_call_audit_events` under the key id, owner, tool, and outcome, never the arguments, results, or raw key; a call that cannot be recorded gets `503`, and deleting the owner keeps the audit rows
- Any authenticated user can create API keys
- API keys never carry admin-audience scopes and never authenticate to the admin MCP endpoint
- RSS keys are read-only, but they are still bearer credentials in URLs. Keyed RSS responses use `Cache-Control: private` and `Referrer-Policy: no-referrer`; users should revoke keys that appear in logs, referrals, or shared URLs.

## Related

- [docs/overview/architecture/services/api-keys/README.md](../../overview/architecture/services/api-keys/README.md) — service implementation and key hashing
- [docs/requirements/navigation/ACCESSIBILITY.md](../navigation/ACCESSIBILITY.md)
- [Backend rules](../../../backend/AGENTS.md) — workspace service and API conventions
- [API keys service rules](../../../backend/services/api-keys/AGENTS.md) — service-specific coding rules
