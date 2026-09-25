# Agent Tools

Reference for all LLM tool definitions registered in `backend/tools/registry/`. Tools are
the callable primitives exposed to LLM agents and to external clients via the MCP and iOS
native SDK surfaces.

See also:

- [Generated tool catalog](catalog.md)
- [Tool registry source](../../../../backend/tools/registry/index.mts)
- [Tool type definitions](../../../../backend/tools/types.mts)
- [Tool implementation directory](../../../../backend/tools/)
- [Agents that use these tools](../../../../backend/agents/CLAUDE.md)

---

## Surfaces

Each tool declares one or more surfaces in `meta.surfaces`. The default when absent is
`['internal']`.

| Surface     | Description                                                                                         |
| ----------- | --------------------------------------------------------------------------------------------------- |
| `internal`  | Available only to server-side agents. Never exposed over any external protocol.                     |
| `mcp`       | Exposed via the user-facing Model Context Protocol server. Accessible to MCP-connected LLM clients. |
| `admin_mcp` | Exposed via the staff-only admin Model Context Protocol server. Restricted by role, not by plan.    |
| `client`    | Exported in `backend/tools/manifest.json` for first-party native clients (e.g., iOS Swift agent).   |

A tool may be on multiple surfaces simultaneously. Almost all public user-facing tools carry
all three of `internal`, `mcp`, and `client`. A tool must not carry both `mcp` and
`admin_mcp` if it mutates data — see [Plan Gating](#plan-gating).

---

## Plan Gating

`meta.plan` sets the minimum membership plan required to dispatch a tool on the external
user `mcp` surface (`tools/list` / `tools/call`; enforced by
[`isToolAllowedForPlan`](../../../../backend/tools/registry/select.mts) in both
`listMcpToolsForUser` and `callMcpTool`). Possible values:

- `'free'` (default when absent) — available to all authenticated users
- `'plus'` — requires Plus or Pro membership
- `'pro'` — requires Pro membership

The gate applies only at that MCP dispatch boundary: it never affects native/client tool
invocation (`manifest.json` carries no plan field), direct REST routes, or internal-agent
calls. It must stay unset (or `'free'`) on any tool exposed on `admin_mcp` — a single `plan`
field cannot express separate per-surface plans, so a mutating tool cannot share the `mcp`
and `admin_mcp` surfaces until the metadata model can (enforced by the registry invariant
tests in `backend/tools/registry/registry.test.mts`).

Every mutating tool currently exposed on the user `mcp` surface (`manage_my_cards`,
`manage_my_point_valuations`, `manage_my_rewards_statuses`, `manage_my_spending`,
`update_my_financial_profile`) requires `plan: 'plus'`; every user-`mcp` read tool stays
`'free'`. No production tool requires `'pro'` yet — see the generated
[tool catalog](catalog.md)'s Plan column for the authoritative per-tool value.

---

## Parameter Translation Notes

### `manage-my-*` tools (`action` enum → REST verb)

Tools created with `createManageEntityTool()` dispatch on an `action` parameter rather than
exposing separate tools per CRUD operation. The mapping to REST verbs is:

| `action` value | REST equivalent       |
| -------------- | --------------------- |
| `list`         | `GET /api/v1/my/…`    |
| `add`          | `POST /api/v1/my/…`   |
| `update`       | `PATCH /api/v1/my/…`  |
| `remove`       | `DELETE /api/v1/my/…` |

The `id` parameter is required for `update` and `remove` actions; it is the row UUID
returned by the corresponding `list` action.

---

## Server-Only Tools Rationale

Tools with `surfaces: ['internal']` are excluded from MCP and client surfaces for one of
these reasons:

- **Write tools with extra curry args** — tools like `add_related_topic` take additional
  call-time arguments (entity type + entity ID) that cannot be expressed in a flat
  MCP-style dispatch. They require agent wiring via `withCurry`.
- **Internal-only data** — tools like `search_crawls`, `search_crawl_chunks`,
  `search_rss_feed_items` operate on data not appropriate for direct client consumption.

---

## iOS Client Implementation Notes

The `backend/tools/manifest.json` file is the source of truth for native client tool
registration. The iOS Swift agent should:

1. Read `manifest.json` at build time or app launch to populate `@Generable` parameter
   structs for each tool.
2. Use the `api` field to map tool calls to REST endpoints without a runtime MCP
   connection. Each entry in `api` is `{ method, path }` where `:param` segments
   are path parameters.
3. Authenticate requests with the standard Bearer token from the user's session; no
   separate MCP auth flow is needed for client-surface tools.

---

## Follow-up Issues

- **Bearer auth for native clients** — define the auth contract for client-surface tool
  calls from iOS (Bearer token scope, refresh semantics, error codes).
- **Prompt-injection wrapping** — all tool results that include user-generated or
  external content must be wrapped with `wrapExternalContent()` before being returned
  to the LLM. Audit each client-surface tool that calls external data sources.
