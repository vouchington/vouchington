# MCP Tools Service

Implements the MCP (Model Context Protocol) server logic: listing tools, executing tool calls, and handling stateless HTTP requests using the MCP SDK.

## Modules

| File                                  | Description                                                                                  |
| ------------------------------------- | -------------------------------------------------------------------------------------------- |
| `config.mts`                          | User/admin MCP server names, routes, surfaces, and OAuth audiences                           |
| `authenticate.mts`                    | Verify a bearer OAuth access token or MCP API key for the route's audience                   |
| `challenge.mts`                       | Build RFC 6750 and RFC 9728 `WWW-Authenticate` challenges                                    |
| `resolve-tool-call.mts`               | The ordered role, plan, and scope policy, plus step-up scope discovery                       |
| `list-tools.mts`                      | Filter registered tools by configured surface and `resolve-tool-call.mts` policy             |
| `call-tool.mts`                       | Execute a tool call with full authorization enforcement                                      |
| `serialize-mcp-tool-result.mts`       | Bounded JSON serializer for MCP tool results                                                 |
| `handle-request.mts`                  | Stateless per-request MCP transport using `WebStandardStreamableHTTPServerTransport`         |
| `instructions.mts`                    | Per-surface server `instructions` sent on `initialize`                                       |
| `index.mts`                           | Barrel: exports request handlers, helpers, and user/admin MCP configs                        |
| `catalog/build-mcp-catalog.mts`       | Build the `api-fixtures/v1/mcp.json` catalog and find `meta.api` routes missing from OpenAPI |
| `catalog/agent-tool-catalog.mts`      | Render the agent-tools catalog table and the native-client `manifest.json`                   |
| `catalog/find-api-hint-conflicts.mts` | Find tools whose MCP hints disagree with the REST operations in `meta.api`                   |
| `catalog/build-mcp-catalog.test.mts`  | Snapshot every generated catalog artifact; `pnpm run mcp:catalog` regenerates them           |

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
ownership inside a tool, and scope remain independent checks. Legacy `mcp.user:*` and
`mcp.admin:*` grants remain compatible supersets while resource-scoped credentials are preferred.

## Related

- Registry: [tools registry](../../tools/registry/)
- API: [MCP API](../../api/v1/mcp/)
- API Keys: [api-keys service](../api-keys/)
