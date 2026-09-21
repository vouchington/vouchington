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

| Surface    | Description                                                                                       |
| ---------- | ------------------------------------------------------------------------------------------------- |
| `internal` | Available only to server-side agents. Never exposed over any external protocol.                   |
| `mcp`      | Exposed via the Model Context Protocol server. Accessible to MCP-connected LLM clients.           |
| `client`   | Exported in `backend/tools/manifest.json` for first-party native clients (e.g., iOS Swift agent). |

A tool may be on multiple surfaces simultaneously. Almost all public tools carry all three
(`internal`, `mcp`, `client`).

---

## Plan Gating

`meta.plan` sets the minimum membership plan required to invoke the tool. Possible values:

- `'free'` (default when absent) — available to all authenticated users
- `'plus'` — requires Plus or Pro membership
- `'pro'` — requires Pro membership

No tools are plan-gated in the initial release; the mechanism exists for future use.

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
