# Agent Tools

Reference for all LLM tool definitions registered in `backend/tools/registry/`. Tools are
the callable primitives exposed to LLM agents and to external clients via the MCP and iOS
native SDK surfaces.

See also:

- [Generated tool catalog](catalog.md)
- [Generated MCP catalog](../../../../api-fixtures/v1/mcp.json)
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

A tool may be on multiple surfaces simultaneously. Most user-facing tools carry `internal`,
`mcp`, and `client`; staff tools carry `admin_mcp` in place of `mcp`. A tool must not carry both
`mcp` and `admin_mcp` if it mutates data — see [Plan Gating](#plan-gating).

---

## MCP Metadata

Every tool sets `meta.title`, a human-readable display name that `tools/list` sends as the MCP
`title`. `meta.annotations` carries the MCP behavior hints: read tools set `readOnlyHint: true`,
which `tools/list` also sends as `idempotentHint: true`; write tools set `destructiveHint` and
`idempotentHint` explicitly. Tools that call a third-party service, such as Wikipedia, set
`openWorldHint: true`.

When a tool names REST equivalents in `meta.api`, its hints must agree with them:
[`find-api-hint-conflicts.mts`](../../../../backend/services/mcp-tools/catalog/find-api-hint-conflicts.mts)
fails the catalog test when a read tool names a non-`GET` operation, a write tool names a `GET`,
or `idempotentHint` differs from whether every named operation is a `PUT` or `DELETE`.

Each MCP server also sends `instructions` on `initialize`
([`instructions.mts`](../../../../backend/services/mcp-tools/instructions.mts)) so agents learn
how the tools fit together before calling them. A tool result larger than the MCP response limit
returns a tool error that asks the caller to narrow the query or lower the limit.

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

## Generated Artifacts

[`build-mcp-catalog.test.mts`](../../../../backend/services/mcp-tools/catalog/build-mcp-catalog.test.mts)
builds every registry-derived artifact and fails when a committed copy is stale. Run
`pnpm run mcp:catalog` from the repository root after adding or modifying tools to regenerate
them:

| Artifact                                                                 | Contents                                                                                                                        |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| [`api-fixtures/v1/mcp.json`](../../../../api-fixtures/v1/mcp.json)       | Each MCP server's endpoint and the full `tools/list` entry, minimum plan, roles, and REST equivalent per tool                   |
| [`catalog.md`](catalog.md)                                               | The generated tool table between its `BEGIN GENERATED` and `END GENERATED` markers                                              |
| [`backend/tools/manifest.json`](../../../../backend/tools/manifest.json) | `client`-surface tools for first-party native clients — see [iOS Client Implementation Notes](#ios-client-implementation-notes) |

The same test asserts that each server's catalog equals what `tools/list` returns to a caller
holding every role, the Pro plan, and every scope, that every `meta.api` route exists in
`api-fixtures/v1/openapi.json`, that every listed tool has a title, and that hints agree with
their REST equivalents (see [MCP Metadata](#mcp-metadata)). The `docs-publish` workflow renders
`mcp.json` with [`ci/render-mcp-docs.mts`](../../../../ci/render-mcp-docs.mts) onto the credentialed
[private docs site](../../../operations/private-docs-site.md) at `/mcp/`, next to the OpenAPI
reference.

---

## Parameter Conventions

- **Topics** — topic lookup parameters (`topic_id`, `topic_id_a`, `topic_id_b`) take a UUID or
  slug, like the REST `:idOrSlug` routes, and results return the resolved topic UUID. A value that
  names no topic returns `{ success: false, error: 'Topic not found' }`. The search tools'
  `similar_topic_id` is a similarity-search seed and takes a UUID, and write-tool fields that
  mirror a REST request body (such as `manage_my_cards.card_id`) take what that body takes.
- **Search queries** — a tool with a REST equivalent names its query after the REST parameter
  (`text_search_query`, `semantic_search_query`). `query` remains only on tools without one, such
  as `search_wikipedia`.
- **Post types** — a `post_type` enum accepts the same values as its REST equivalent:
  `VALID_FILTERABLE_POST_TYPES` for `GET /api/v1/posts` and `VALID_TRENDING_POST_TYPES` for
  `GET /api/v1/trending-posts` (both in `ts-shared/feed-capabilities`).
- **Alternatives** — `get_domain_ratings` takes exactly one of `url` or `hostname`; its schema
  enforces this with `minProperties`/`maxProperties`, which MCP argument validation checks.

### `manage-my-*` tools (`action` enum → REST verb)

Tools created with `createManageEntityTool()` dispatch on an `action` parameter rather than
exposing separate tools per write operation. The mapping to REST verbs is:

| `action` value | REST equivalent       |
| -------------- | --------------------- |
| `add`          | `POST /api/v1/my/…`   |
| `update`       | `PATCH /api/v1/my/…`  |
| `remove`       | `DELETE /api/v1/my/…` |

The `id` parameter is required for `update` and `remove` actions; it is the row UUID
returned by the matching `get_my_*` tool.

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
registration. Each entry carries the tool's name, description, REST `api` mapping, and declared
scopes; `parameters` is always `null`. The iOS Swift agent should:

1. Use the `api` field to map tool calls to REST endpoints without a runtime MCP
   connection. Each entry in `api` is `{ method, path }` where `:param` segments
   are path parameters.
2. Build its `@Generable` argument structs from those REST operations in
   [`api-fixtures/v1/openapi.json`](../../../../api-fixtures/v1/openapi.json); the MCP
   `inputSchema` in `mcp.json` describes the server-side tool, not the REST request.
3. Authenticate requests with the app's existing session, like any other API call; no
   separate MCP auth flow is needed for client-surface tools.

---

## External Content

A tool result that includes member-authored or third-party text marks that text with
`wrapExternalContent()` from `@jongleberry/vurst-prompt` before returning it to a model, as
`get_topic_details` does for topic markdown and `search_posts` does for post content.
