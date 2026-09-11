# MCP Tools Service

Implements the MCP (Model Context Protocol) server logic: listing tools, executing tool calls, and handling stateless HTTP requests using the MCP SDK.

## Modules

| File                 | Description                                                                          |
| -------------------- | ------------------------------------------------------------------------------------ |
| `config.mts`         | User/admin MCP server names, routes, surfaces, and permission scopes                 |
| `list-tools.mts`     | Filter registered tools by configured surface, role, plan, and API key permissions   |
| `call-tool.mts`      | Execute a tool call with full authorization enforcement                              |
| `handle-request.mts` | Stateless per-request MCP transport using `WebStandardStreamableHTTPServerTransport` |
| `index.mts`          | Barrel: exports request handlers, helpers, and user/admin MCP configs                |

## Authorization

Each `tools/call` request re-enforces the same checks as `tools/list`:

1. Tool surface must match the route config: `mcp` for `/api/v1/mcp`, `admin_mcp` for `/api/v1/admin/mcp`
2. Role check (`isToolAllowedForUser`)
3. Plan check (`isToolAllowedForPlan`)
4. Permission check: non-read-only user tools require `mcp-tools:write`; non-read-only admin tools require `mcp-admin-tools:write`

## Related

- Registry: [tools registry](../../tools/registry/)
- API: [MCP API](../../api/v1/mcp/)
- API Keys: [api-keys service](../api-keys/)
