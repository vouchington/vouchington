# MCP Tools Service Module Inventory

| File                                 | Description                                                                                 |
| ------------------------------------ | ------------------------------------------------------------------------------------------- |
| `config.mts`                         | User/admin MCP server names, routes, surfaces, OAuth audiences, API-key and audit policy    |
| `authenticate.mts`                   | Verify a bearer OAuth access token, or a user MCP API key where the route accepts keys      |
| `audit.mts`                          | Durable per-call audit context and the one batched `mcp_call_audit_events` insert           |
| `classify-calls.mts`                 | Map a parsed JSON-RPC body to audit events without keeping arguments, results, or raw names |
| `challenge.mts`                      | Build RFC 6750 and RFC 9728 `WWW-Authenticate` challenges                                   |
| `resolve-tool-call.mts`              | The ordered role, plan, and scope policy, plus step-up scope discovery                      |
| `list-tools.mts`                     | Filter registered tools by configured surface and `resolve-tool-call.mts` policy            |
| `call-tool.mts`                      | Execute a tool call with full authorization enforcement                                     |
| `serialize-mcp-tool-result.mts`      | Bounded JSON serializer for MCP tool results                                                |
| `build-tool-result.mts`              | Build the `tools/call` result; validate and attach `structuredContent` for declared schemas |
| `@voucha/mcp/schema-validator`       | The one Ajv setup for tool arguments and output schemas                                     |
| `handle-request.mts`                 | Stateless per-request MCP transport using `WebStandardStreamableHTTPServerTransport`        |
| `instructions.mts`                   | Per-surface server `instructions` sent on `initialize`                                      |
| `index.mts`                          | Barrel: exports request handlers, helpers, and user/admin MCP configs                       |
| `catalog/build-mcp-catalog.mts`      | Build the `api-fixtures/v1/mcp.json` catalog from the registered tools                      |
| `catalog/agent-tool-catalog.mts`     | Render the agent-tools catalog table                                                        |
| `catalog/build-mcp-catalog.test.mts` | Snapshot every generated catalog artifact; fail any MCP tool with no output schema          |

`catalog/find-api-hint-conflicts.mts` finds tools whose MCP hints disagree with the REST operations
in `meta.api`; see [MCP Metadata](../../mcp/README.md#mcp-metadata).
