# MCP Server API

Stateless MCP Streamable HTTP endpoint. Exposes user-scoped Voucha tools to MCP clients via API key authentication. Admin tools use the separate admin MCP endpoint documented in [../admin/README.md](../admin/README.md#mcp-clients).

## Endpoints

| Method   | Route         | Authentication     | HTTP Caching | Description                 |
| -------- | ------------- | ------------------ | ------------ | --------------------------- |
| `POST`   | `/api/v1/mcp` | Bearer MCP API key | No           | Handle MCP JSON-RPC request |
| `GET`    | `/api/v1/mcp` | —                  | No           | 405 Method Not Allowed      |
| `DELETE` | `/api/v1/mcp` | —                  | No           | 405 Method Not Allowed      |

## Authentication

Uses Bearer API keys of type `mcp` (not session cookies). The API key must have `mcp-tools:read` permission. Write operations (non-read-only user tools) additionally require `mcp-tools:write`.

Create MCP API keys at `POST /api/v1/my/api-keys` with `type: "mcp"`.

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
| `tools/list` | Lists tools filtered by role, plan, and key permissions |
| `tools/call` | Executes a tool; enforces same checks as list           |

## Performance

| Endpoint         | Round Trips | Caching | Notes                                                                                              |
| ---------------- | ----------- | ------- | -------------------------------------------------------------------------------------------------- |
| POST /api/v1/mcp | 3-5         | None    | API key validate + user fetch + rate limit + tool execute; response body streams with backpressure |

## Related

- Service: [MCP Tools service](../../../services/mcp-tools/)
- API Keys: [api-keys service](../../../services/api-keys/)
- Parent: [API CLAUDE](../../CLAUDE.md)
