# MCP Tools Service

Implements the MCP (Model Context Protocol) server logic: listing tools, executing tool calls, and handling stateless HTTP requests using the MCP SDK.

## Modules

| File                            | Description                                                                          |
| ------------------------------- | ------------------------------------------------------------------------------------ |
| `config.mts`                    | User/admin MCP server names, routes, and surfaces                                    |
| `list-tools.mts`                | Filter registered tools by configured surface, role, plan, and API key permissions   |
| `call-tool.mts`                 | Execute a tool call with full authorization enforcement                              |
| `serialize-mcp-tool-result.mts` | Bounded JSON serializer for MCP tool results                                         |
| `handle-request.mts`            | Stateless per-request MCP transport using `WebStandardStreamableHTTPServerTransport` |
| `index.mts`                     | Barrel: exports request handlers, helpers, and user/admin MCP configs                |

## Authorization

Each `tools/call` request re-enforces the same checks as `tools/list`:

1. Tool surface must match the route config: `mcp` for `/api/v1/mcp`, `admin_mcp` for `/api/v1/admin/mcp`
2. Role check (`isToolAllowedForUser`)
3. Plan check (`isToolAllowedForPlan`)
4. Scope check: every surfaced tool declares nonempty canonical required scopes; missing scopes
   hide the tool and reject direct calls.

Route admission verifies only that the credential is for the user or admin audience. Role, plan,
ownership inside a tool, and scope remain independent checks. Legacy `mcp.user:*` and
`mcp.admin:*` grants remain compatible supersets while resource-scoped credentials are preferred.

## Related

- Registry: [tools registry](../../tools/registry/)
- API: [MCP API](../../api/v1/mcp/)
- API Keys: [api-keys service](../api-keys/)
