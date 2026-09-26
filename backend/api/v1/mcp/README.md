# MCP Server API

Stateless MCP Streamable HTTP endpoint. Exposes user-scoped Voucha tools to MCP clients that authenticate with an OAuth access token or an MCP API key. Admin tools use the separate admin MCP endpoint documented in [../admin/README.md](../admin/README.md#mcp-clients).

Public discovery documents such as `/llms.txt` advertise this endpoint so that agents use MCP instead of browser automation; see [Agent Access](../../../../docs/requirements/platform/agent-access.md).

## Endpoints

| Method   | Route         | Authentication                       | HTTP Caching | Description                 |
| -------- | ------------- | ------------------------------------ | ------------ | --------------------------- |
| `POST`   | `/api/v1/mcp` | Bearer OAuth access token or API key | No           | Handle MCP JSON-RPC request |
| `GET`    | `/api/v1/mcp` | —                                    | No           | 405 Method Not Allowed      |
| `DELETE` | `/api/v1/mcp` | —                                    | No           | 405 Method Not Allowed      |

## Authentication

The bearer credential is an OAuth access token bound to this resource, or an API key of type `mcp`. Session cookies are never read. Each tool requires its own resource scopes, such as `topics:read` or `cards:write` (see the Scopes column of the [tool catalog](../../../../docs/overview/architecture/agent-tools/catalog.md)); the `mcp.user:read` and `mcp.user:write` compatibility grants cover every user read and write scope. See [API key permissions](../../../../docs/requirements/users/api-keys.md#permissions). Write tools also require a paid plan; see [Plan Gating](../../../../docs/overview/architecture/agent-tools/README.md#plan-gating).

MCP clients that support OAuth need only the endpoint URL. A request without a credential gets `401` with a `WWW-Authenticate` challenge that names the [protected-resource metadata](../../oauth/README.md#routes), and a single `tools/call` that lacks a scope gets `403` with `error="insufficient_scope"` and the scopes to re-authorize with. See [MCP challenges](../../../../docs/requirements/security/OAUTH-AUTHORIZATION-SERVER.md#mcp-challenges).

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

## Performance

| Endpoint         | Round Trips | Caching | Notes                                                                                                 |
| ---------------- | ----------- | ------- | ----------------------------------------------------------------------------------------------------- |
| POST /api/v1/mcp | 3-5         | None    | Credential validate + user fetch + rate limit + tool execute; response body streams with backpressure |

## Related

- Service: [MCP Tools service](../../../services/mcp-tools/)
- API Keys: [api-keys service](../../../services/api-keys/)
- OAuth: [authorization-server service](../../../services/oauth-authorization-server/)
- Parent: [API CLAUDE](../../CLAUDE.md)
