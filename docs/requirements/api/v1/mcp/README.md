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

### Paged results

`search_posts`, `search_topics`, `get_trending_posts` and `get_trending_topics` take the `after` and
`limit` of their REST routes and return `page_info` (`has_next_page`, `start_cursor`,
`end_cursor`). `after` is an opaque cursor: pass the previous result's `page_info.end_cursor` to get
the next page. An oversized `limit` is clamped to 100 as on REST; `0` and a malformed or foreign
cursor are refused. `get_topic_details` pages only its children, with `children_after`,
`children_limit` and `children_page_info`, when `hierarchy` asks for them.

## Performance

| Endpoint         | Round Trips | Caching | Notes                                                                                                 |
| ---------------- | ----------- | ------- | ----------------------------------------------------------------------------------------------------- |
| POST /api/v1/mcp | 3-5         | None    | Credential validate + user fetch + rate limit + tool execute; response body streams with backpressure |

## Related

- Service: [MCP Tools service](../../../../../backend/services/mcp-tools/)
- API Keys: [api-keys service](../../../../../backend/services/api-keys/)
- OAuth: [authorization-server service](../../../../../backend/services/oauth-authorization-server/)
- Parent: [API CLAUDE](../../../../../backend/api/AGENTS.md)
