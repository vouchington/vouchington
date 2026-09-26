# API Keys

API keys provide programmatic access to Voucha features that require authentication, including RSS feeds and MCP clients.

## Key Types

| Type  | Description                                               |
| ----- | --------------------------------------------------------- |
| `rss` | RSS feed access (read-only, URL query parameter)          |
| `mcp` | User or admin MCP server access (Bearer token, HTTP POST) |

## Key Format

All keys follow `voucha_<type>_<32 hex random>_<16 hex HMAC checksum>`.

Example: `voucha_rss_a1b2c3d4e5f6789012345678abcdef01_a3f29c7e4d8b1f05`

- **Brand prefix**: `voucha_`
- **Type segment**: `rss` (typed enum, extensible)
- **Random**: 16 bytes → 32 lowercase hex chars (128-bit entropy)
- **Checksum**: first 16 hex chars of `HMAC-SHA256(API_KEY_CHECKSUM_SECRET, "voucha_<type>_<random>")`
- **Display prefix**: `voucha_${type}_${random.slice(0, 4)}` (e.g. `voucha_rss_a1b2`)

Keys are stored as SHA-256 hashes and cannot be recovered after creation. The raw key is shown exactly once at creation time.

## Permissions

API keys use a permission-based access control system. Each key has a `permissions` array that determines what it can access.

### Available Permissions

| Permission             | Description                                           |
| ---------------------- | ----------------------------------------------------- |
| `rss:read`             | Access RSS feed endpoints (`/rss/posts`, `/rss/news`) |
| `topics:read`          | Read topic and recommendation MCP tools               |
| `posts:read`           | Read post MCP tools                                   |
| `cards:read/write`     | Read or manage cards; write requires read             |
| `mcp.user:read/write`  | Compatibility grants for existing user MCP keys       |
| `mcp.admin:read/write` | Compatibility grants for existing admin MCP keys      |

Scopes use the strict lowercase `<resource>:<action>` grammar. Dot-delimited resources compose the
surface and audience, such as `mcp.user` and `mcp.admin`. Unknown, whitespace-padded, case-normalized,
duplicate, or write-without-read scope sets are rejected. RSS keys accept only `rss:read`; MCP keys
accept scopes for exactly one user or admin audience, never both, and admin scopes require an administrator owner.
OAuth access tokens are the alternative MCP credential. Each grant binds to one protected resource,
so its scopes also belong to that resource's audience; see the
[OAuth authorization server](../security/OAUTH-AUTHORIZATION-SERVER.md#protected-resources-and-discovery).

### Scope catalogue

`GET /api/v1/scopes` lists every canonical scope with its resource, action, audience, prerequisite
(`requires`) and the credential surfaces (`api-key`, `oauth`) that accept it. Web and native pickers
render this list instead of hard-coding scope strings, so a new scope is a data change for every
client. See the [Scopes API](../../../backend/api/v1/scopes/README.md).

MCP keys must be either user MCP or admin MCP, not both. Admin MCP scopes can only be created by administrators.

## Endpoints

### Management (authenticated via session)

| Method   | Path                      | Description          |
| -------- | ------------------------- | -------------------- |
| `GET`    | `/api/v1/my/api-keys`     | List your API keys   |
| `POST`   | `/api/v1/my/api-keys`     | Create a new API key |
| `DELETE` | `/api/v1/my/api-keys/:id` | Revoke an API key    |

### OAuth apps

Developers register their own OAuth apps from settings instead of relying only on anonymous dynamic
registration, so an app that asks users for access has an accountable owner. The
[OAuth app routes](../../../backend/api/v1/my/reference-oauth-apps.md) list, register, rename or
re-point, revoke, and rotate the secret of the caller's own apps.

Registration goes through the same client-name, redirect-URI and auth-method validators as dynamic
registration, and `scopes` is a list of catalogue scopes (at most 32). A confidential app's client
secret is returned only by registration and rotation, is stored as a hash and is never readable
afterwards; public apps have no secret, so rotation returns 409. Renaming an app or changing its
redirect URIs clears staff verification, because staff verified the old name and destinations;
administrators verify an app's name from the [Admin API](../../../backend/api/v1/admin/README.md).
Removing a redirect URI also cancels sign-ins still waiting on it: a pending consent request or an
unexchanged authorization code for that URI is refused.
Revoking an app stops its access tokens, refresh tokens and authorization codes on their next use and
removes its grants from every user's connected apps. Other users' apps return 404, and suspended
users cannot change apps.

### Connected apps

Agents that connect through OAuth rather than a pasted key appear on the user's connected-apps list,
so AI-agent access stays visible to the user.

| Method   | Path                          | Description                         |
| -------- | ----------------------------- | ----------------------------------- |
| `GET`    | `/api/v1/my/oauth-grants`     | List the OAuth apps you approved    |
| `DELETE` | `/api/v1/my/oauth-grants/:id` | Revoke an app's access to your data |

Each grant shows the client name, whether staff verified that name, the protected resource, the
granted scopes, when consent was given and when the app last used its access. Revoking a grant stops
its access and refresh tokens on their next use; consenting again creates a new grant. Suspended
users cannot revoke grants, matching API-key management.

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

## Rate Limits

RSS feed endpoints are rate-limited to **3 requests per minute** per identity per route, AND per IP address per route. Both limits must pass. The 4th request within a 60-second window is rejected with 429. Identity is the API key ID (when provided) or `anon:{ip}` (when no key is provided).

## Usage

### Creating an API Key

1. Go to Settings > API Keys (`/my/api-keys`)
2. Click "Create API Key"
3. Choose an RSS feed or MCP server key, pick the MCP key's scopes, then enter a label
4. Copy the raw key immediately (it won't be shown again)

An RSS key always carries `rss:read`. An MCP key's scope picker renders the
[scope catalogue](#scope-catalogue) entries that accept the `api-key` surface, one row per resource
with read and write checkboxes and the `mcp.<audience>` umbrella row first. Checking a scope also
checks its `requires` prerequisite, and unchecking a prerequisite drops the scopes that need it, so
the picker never sends a set the API rejects. Administrators also choose the key's audience ("Your
account" or "Administrator"); switching audience clears the selection because a key holds one
audience. Create stays disabled until the label and at least one scope are set.

### Managing OAuth apps and connected apps

The same page lists the caller's [OAuth apps](#oauth-apps) below their keys. Registering an app takes
a name, one redirect URI per line, a confidential or public client type and catalogue scopes that
accept the `oauth` surface; admin-audience scopes are offered only to administrators. A confidential
app's client secret appears once, after registration or rotation, in a dismissible alert with a copy
button. Each app row shows its client ID, redirect URIs, scopes and verification badge; editing sends
only the changed name or redirect URIs and warns that saving clears verification, rotating asks for
confirmation (confidential apps only), and revoking asks for confirmation.

Settings > Connected apps (`/my/connected-apps`) lists the [grants](#connected-apps) on the account,
with a verified or unverified badge, the granted scopes and the consent and last-used dates, and
revokes one after confirmation.

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
- Revoked keys retain an audit trail but are immediately invalid
- Any authenticated user can create API keys
- Admin MCP scopes require the key owner to have the `administrator` role at creation and when the admin MCP endpoint is used
- RSS keys are read-only, but they are still bearer credentials in URLs. Keyed RSS responses use `Cache-Control: private` and `Referrer-Policy: no-referrer`; users should revoke keys that appear in logs, referrals, or shared URLs.

## Related

- [backend/services/api-keys/README.md](../../../backend/services/api-keys/README.md) — service implementation and key hashing
- [docs/requirements/navigation/ACCESSIBILITY.md](../navigation/ACCESSIBILITY.md)
- [Backend rules](../../../backend/CLAUDE.md) — workspace service and API conventions
- [API keys service rules](../../../backend/services/api-keys/CLAUDE.md) — service-specific coding rules
