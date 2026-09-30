# MCP Tools Service

Source entrypoint: [backend/services/mcp-tools/README.md](../../../../../backend/services/mcp-tools/README.md)

Implements the MCP (Model Context Protocol) server logic: listing tools, executing tool calls, and handling stateless HTTP requests using the MCP SDK.

## Modules

| File                                 | Description                                                                                  |
| ------------------------------------ | -------------------------------------------------------------------------------------------- |
| `config.mts`                         | User/admin MCP server names, routes, surfaces, OAuth audiences, API-key and audit policy     |
| `authenticate.mts`                   | Verify a bearer OAuth access token, or a user MCP API key where the route accepts keys       |
| `audit.mts`                          | Durable per-call audit context and the one batched `mcp_call_audit_events` insert            |
| `classify-calls.mts`                 | Map a parsed JSON-RPC body to audit events without keeping arguments, results, or raw names  |
| `challenge.mts`                      | Build RFC 6750 and RFC 9728 `WWW-Authenticate` challenges                                    |
| `resolve-tool-call.mts`              | The ordered role, plan, and scope policy, plus step-up scope discovery                       |
| `list-tools.mts`                     | Filter registered tools by configured surface and `resolve-tool-call.mts` policy             |
| `call-tool.mts`                      | Execute a tool call with full authorization enforcement                                      |
| `serialize-mcp-tool-result.mts`      | Bounded JSON serializer for MCP tool results                                                 |
| `handle-request.mts`                 | Stateless per-request MCP transport using `WebStandardStreamableHTTPServerTransport`         |
| `instructions.mts`                   | Per-surface server `instructions` sent on `initialize`                                       |
| `index.mts`                          | Barrel: exports request handlers, helpers, and user/admin MCP configs                        |
| `catalog/build-mcp-catalog.mts`      | Build the `api-fixtures/v1/mcp.json` catalog and find `meta.api` routes missing from OpenAPI |
| `catalog/agent-tool-catalog.mts`     | Render the agent-tools catalog table and the native-client `manifest.json`                   |
| `catalog/build-mcp-catalog.test.mts` | Snapshot every generated catalog artifact; `pnpm run mcp:catalog` regenerates them           |

`catalog/find-api-hint-conflicts.mts` finds tools whose MCP hints disagree with the REST operations
in `meta.api`; see [MCP Metadata](../../agent-tools/README.md#mcp-metadata).

## Authorization

Each `tools/call` request re-enforces the same checks as `tools/list`:

1. Tool surface must match the route config: `mcp` for `/api/v1/mcp`, `admin_mcp` for `/api/v1/admin/mcp`
2. Role check (`isToolAllowedForUser`)
3. Plan check (`isToolAllowedForPlan`)
4. Scope check: every surfaced tool declares nonempty canonical required scopes; missing scopes
   hide the tool and reject direct calls.

`authorizeMcpTool` in `resolve-tool-call.mts` is the single policy for both, so listing and calling
cannot disagree. When a single OAuth `tools/call` fails only on scope, the route answers `403
insufficient_scope` with the scopes to re-authorize with; every other denial stays an in-band
JSON-RPC error.

Route admission verifies only that the credential is for the user or admin audience. Role, plan,
ownership inside a tool, and scope remain independent checks. Legacy `mcp.user:*` grants remain a
compatible superset while resource-scoped credentials are preferred.

## Admin MCP is OAuth-only

`McpServerConfig.acceptsApiKeys` is `true` for the user route and `false` for the admin route.
`authenticateMcpBearer` always tries OAuth first (`validateOAuthAccessToken`, which owns expiry,
revocation of the token, grant, and client, user deletion or suspension, and the exact protected
resource) and reaches the API-key path only when the route accepts keys. An API key sent to
`/api/v1/admin/mcp` therefore fails as an unrecognized credential: `401` with an `invalid_token`
challenge. `mcp.admin:read` and `mcp.admin:write` accept only the `oauth` scope surface, so API-key
creation rejects them too.

A verified token then needs the `administrator` role (`403`, `role_denied`), at least one
admin-audience scope (`403`, `insufficient_scope`, with a challenge naming `mcp.admin:read`), and
the scope each tool declares (`tools/list` hides tools the token cannot call; a direct call gets the
`403` step-up challenge).

## Admin MCP audit log

Every call a verified OAuth principal makes to the admin route writes an append-only
`mcp_call_audit_events` row before it runs (`McpServerConfig.auditCalls`). The table is
range-partitioned by UUIDv7 `id`, so `occurred_at` is a virtual column derived from the id.

| Column                                   | Contents                                                                                                                                                               |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `actor_user_id`                          | Token owner, through `retained_user_identities`, so the record survives hard deletion                                                                                  |
| `oauth_client_id`                        | Foreign key to the client the token was issued to                                                                                                                      |
| `resource`                               | Protected resource URL the token was validated against                                                                                                                 |
| `surface`, `jsonrpc_method`, `tool_name` | Surface, allowlisted JSON-RPC method, and the registered tool name; `NULL` when there is nothing to record                                                             |
| `outcome`                                | `accepted`, `tool_error`, `invalid_request`, `invalid_arguments`, `not_found`, `role_denied`, `plan_denied`, `scopes_undeclared`, `insufficient_scope`, `rate_limited` |
| `correlation_id`                         | Server-minted per request and returned as the `X-Correlation-Id` response header                                                                                       |

- **One row per JSON-RPC message.** A batch writes its rows in order under one correlation id in a
  single insert; a batch above 25 messages is refused with `413` and one `invalid_request` row.
  Rejections before the body is read (role, scope, rate limit, unreadable body) write one row with a
  `NULL` method. An admitted tool call that then fails also writes a `tool_error` row.
- **Redaction by construction.** The schema has no column for tokens, API keys, headers, arguments,
  or results, and `tool_name` holds only names registered on the surface, never caller-supplied
  text. Nothing is scrubbed after the fact.
- **Fail closed.** The write happens before the call, so if it fails the request ends `503` and the
  call never runs. The `tool_error` follow-up is best effort, because the call already ran.
- **Unauthenticated requests write no row.** A request that fails authentication (`401`) or the
  content-type check (`415`) has no verified actor or client to record; `401` is observable in the
  request logs instead.

Rows are append-only (a trigger rejects `UPDATE` and `DELETE`). The user MCP route sets
`auditCalls: false`; its per-call audit reuses this service and table.

## Related

- Registry: [tools registry](../../../../../backend/tools/registry/)
- API: [MCP API](../../../../../backend/api/v1/mcp/)
- API Keys: [api-keys service](../../../../../backend/services/api-keys/)
