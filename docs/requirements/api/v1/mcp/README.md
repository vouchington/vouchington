# MCP Server API

Source entrypoint: [backend/api/v1/mcp/README.md](../../../../../backend/api/v1/mcp/README.md)

Stateless MCP Streamable HTTP endpoint. Exposes user-scoped Voucha tools to MCP clients that authenticate with an OAuth access token or an MCP API key. Admin tools use the separate admin MCP endpoint documented in [../admin/README.md](../admin/README.md#mcp-clients).

Public discovery documents such as `/llms.txt` advertise this endpoint so that agents use MCP instead of browser automation; see [Agent Access](../../../platform/agent-access.md).

## Endpoints

| Method   | Route         | Authentication                       | HTTP Caching | Description                 |
| -------- | ------------- | ------------------------------------ | ------------ | --------------------------- |
| `POST`   | `/api/v1/mcp` | Bearer OAuth access token or API key | No           | Handle MCP JSON-RPC request |
| `GET`    | `/api/v1/mcp` | —                                    | No           | 405 Method Not Allowed      |
| `DELETE` | `/api/v1/mcp` | —                                    | No           | 405 Method Not Allowed      |

## Authentication

The bearer credential is an OAuth access token bound to this resource, or an API key of type `mcp`. Session cookies are never read. Each tool requires its own resource scopes, such as `topics:read` or `cards:write` (see the Scopes column of the [tool catalog](../../../../overview/architecture/agent-tools/catalog.md)); the `mcp.user:read` and `mcp.user:write` compatibility grants cover every user read and write scope. See [API key permissions](../../../users/api-keys.md#permissions). Write tools also require a paid plan; see [Plan Gating](../../../../overview/architecture/agent-tools/README.md#plan-gating).

MCP clients that support OAuth need only the endpoint URL. A request without a credential gets `401` with a `WWW-Authenticate` challenge that names the [protected-resource metadata](../../oauth/README.md#routes), and a single `tools/call` that lacks a scope gets `403` with `error="insufficient_scope"` and the scopes to re-authorize with. See [MCP challenges](../../../security/OAUTH-AUTHORIZATION-SERVER.md#mcp-challenges).

OAuth clients may use either open RFC 7591 registration or an HTTPS Client ID Metadata Document
URL as `client_id`. Authorization-server discovery advertises CIMD support. URL clients are public
clients, require S256 PKCE, and must publish the exact client identifier, redirect URI strings, and
supported scopes in the document. See [Client ID Metadata Documents](../../../security/OAUTH-AUTHORIZATION-SERVER.md#client-id-metadata-documents).

For clients without OAuth, create an MCP API key at `POST /api/v1/my/api-keys` with `type: "mcp"`. API-key scope failures stay in-band JSON-RPC errors.

Codex:

```bash
codex mcp add voucha-user-mcp \
  --url https://staging.voucha.ai/api/v1/mcp \
  --bearer-token-env-var VOUCHA_USER_MCP_KEY
```

Claude Code:

```bash
claude mcp add --scope local voucha-user-mcp --transport http \
  https://staging.voucha.ai/api/v1/mcp \
  --header "Authorization: Bearer ${VOUCHA_USER_MCP_KEY}"
```

## MCP Operations

| Operation    | Description                                             |
| ------------ | ------------------------------------------------------- |
| `initialize` | Returns capabilities and server `instructions`          |
| `tools/list` | Lists tools filtered by role, plan, and key permissions |
| `tools/call` | Executes a tool; enforces same checks as list           |

## Audit

Every call made with a valid OAuth access token or API key is recorded in the durable
`mcp_call_audit_events` log before it runs, one row per JSON-RPC message. A row holds the acting
user, the OAuth client or the API key id, the tool or JSON-RPC method, the outcome (accepted, a
scope, plan, or argument denial, or a tool error), the time, and the correlation id that the
response returns as `X-Correlation-Id`. It never holds the token, key, arguments, or results. A
request with no valid credential writes no row.

- `413`: a batch of more than 25 JSON-RPC messages, recorded as one `invalid_request` row.
- `503`: the audit row could not be stored, so the call did not run.

See the [MCP tools architecture](../../../../overview/architecture/services/mcp-tools/README.md#mcp-audit-log).

## Tool Results

A tool that declares an output schema publishes it in `tools/list` as `outputSchema`: a JSON Schema
object with an `object` root and every `$ref` resolved, so a client needs no other document. The
`tools/call` result for such a tool carries the result twice, as `structuredContent` and as the same
JSON in one `text` content block for clients that predate structured output. The two are always
equal.

The server checks `structuredContent` against the published schema before sending it, so a client
never receives a result that breaks the schema it was promised. A result that fails the check is a
server bug, not a caller error: the caller gets the generic `Tool execution failed. Please try
again.` result (`isError: true`, no `structuredContent`) and operators get an error report that
names the tool and the failing path, never the value.

The 1 MiB response bound covers the whole `tools/call` result of every tool, including the JSON
escaping of the text block, and a structured result counts both copies. An oversized result returns
an `isError` result that asks the caller to narrow the query or lower the limit.

Every tool on this server declares an output schema; the catalog test fails for one that does not.
A tool without one would return only the `text` block, unvalidated. See
[MCP Tools service](../../../../overview/architecture/services/mcp-tools/README.md#structured-tool-results).

The [post and story read tools](../../../../overview/architecture/services/mcp-tools/read-tools.md)
(`get_post`, `get_post_ancestors`, `get_post_descendants`, `get_story`, each requiring the
`posts:read` scope) return an object that is either
`{ success: true, ... }` or `{ success: false, error }`. They read as the credential owner minus
private data: a post or story that is deleted, missing, or visible to the owner only through private
visibility (private audience, private community, or their own unapproved post) is answered as
`{ success: false, error: "Post not found" }` (`"Story not found"`), even to its author, and one
hidden ancestor hides the whole thread. Paged tools (`get_post_descendants`, `get_story`) take
`limit` and `after` and return `page_info` with the same cursor contract as their REST twins; a
malformed cursor returns `{ success: false, error: "Invalid cursor" }`. Post and article text is
wrapped as external content.

`search_posts` follows the same rule: it lists only posts that `get_post` would return to the
credential owner, so the owner's private, audience-limited and unapproved posts and the comments of
a thread `get_post` refuses are never listed, even to their author or an administrator. A
`similar_post_id` that `get_post` would refuse returns an empty page, like an id that matches
nothing. Muted and blocked users, topics and hostnames are still left out. `GET /api/v1/posts` is
unchanged.

The [community read tools](../../../../overview/architecture/services/mcp-tools/read-tools.md#community-read-tools)
(`search_communities`, `get_community`, `get_community_posts`, `get_community_pinned_posts`,
`get_community_members`, each requiring the `communities:read` scope) return the same
`{ success: true, ... }` or `{ success: false, error }` object. They read as a signed-out reader for
every caller: a private, deleted or unknown community is
`{ success: false, error: "Community not found" }`, even to its member, moderator, owner and an
administrator, and never appears in `search_communities`. An anonymous post never names its author,
even to the author or an administrator, and no result carries a viewer sidecar. The paged tools take
`limit` (1 to 25, default 20) and `after` and return `page_info`; a malformed cursor, or one from a
different sort, returns `{ success: false, error: "Invalid cursor" }`. Descriptions, rules and post
text are wrapped as external content.

The [hostname read tools](../../../../overview/architecture/agent-tools/hostname-list-user-read-tools.md#hostnames)
(`search_hostnames`, `get_top_hostnames`, each requiring `hostnames:read`) and
[user read tools](../../../../overview/architecture/agent-tools/hostname-list-user-read-tools.md#users)
(`get_user`, `search_users`, each requiring `users:read`) read as a signed-out reader for every
caller. A hostname result carries its `topic_id` and public trust vote totals, and an
administratively blocked hostname never appears, even to an administrator. A user result is the
public profile only, so no result carries an email address, phone number or suspension, and a
deleted or unknown user is `{ success: false, error: "User not found" }`. The bio is wrapped as
external content.

The [list read tools](../../../../overview/architecture/agent-tools/hostname-list-user-read-tools.md#lists)
(`get_my_lists`, `get_list`, `get_list_items`, each requiring `lists:read`) read a public or
unlisted list by id, as REST does. A private list is readable only by its owner and only when the
credential holds the exact `post-relations.owned-private:write` grant, which `mcp.user:write` does
not imply; every other case, including another user's private list, a removed list and a malformed
id, is the same `{ success: false, error: "List not found" }`. `get_my_lists` leaves private lists
out without the grant, and `get_list_items` leaves out any post `get_post` would refuse, so a page
can hold fewer than `limit` items while `has_next_page` is true. The paged tools take `limit` (1 to 25) and `after`; a malformed cursor returns `{ success: false, error: "Invalid cursor" }`.

### Paged results

`search_posts`, `search_topics`, `get_trending_posts` and `get_trending_topics` take the `after` and
`limit` of their REST routes and return `page_info` (`has_next_page`, `start_cursor`,
`end_cursor`). `after` is an opaque cursor: pass the previous result's `page_info.end_cursor` to get
the next page. An oversized `limit` is clamped to 100 as on REST, and `0` is refused. A malformed or
foreign cursor makes `search_posts` and `search_topics` return
`{ success: false, error: "Invalid cursor" }`; the trending tools refuse it. `get_topic_details`
pages only its children, with `children_after`, `children_limit` and `children_page_info`, when
`hierarchy` asks for them.

## Performance

| Endpoint         | Round Trips | Caching | Notes                                                                                                 |
| ---------------- | ----------- | ------- | ----------------------------------------------------------------------------------------------------- |
| POST /api/v1/mcp | 3-5         | None    | Credential validate + user fetch + rate limit + tool execute; response body streams with backpressure |

## Related

- Service: [MCP Tools service](../../../../../backend/services/mcp-tools/)
- API Keys: [api-keys service](../../../../../backend/services/api-keys/)
- OAuth: [authorization-server service](../../../../../backend/services/oauth-authorization-server/)
- Parent: [API CLAUDE](../../../../../backend/api/AGENTS.md)
