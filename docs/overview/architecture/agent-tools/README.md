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
- [Agents that use these tools](../../../../backend/agents/AGENTS.md)

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
`idempotentHint` explicitly. Tools that call a third-party service set
`openWorldHint: true`.

When a tool names REST equivalents in `meta.api`, its hints must agree with them:
[`find-api-hint-conflicts.mts`](../../../../backend/services/mcp-tools/catalog/find-api-hint-conflicts.mts)
fails the catalog test when a read tool names a non-`GET` operation, a write tool names a `GET`,
or `idempotentHint` differs from whether every named operation is a `PUT` or `DELETE`.

Each MCP server also sends `instructions` on `initialize`
([`instructions.mts`](../../../../backend/services/mcp-tools/instructions.mts)) so agents learn how the tools fit together before calling them. A result over the MCP response limit returns a tool error that asks the caller to narrow the query or lower the limit.

A tool may set `meta.outputSchema` (JSON Schema, `object` root) so `tools/call` also returns validated `structuredContent`; see [Structured tool results](../services/mcp-tools/README.md#structured-tool-results). Every tool exposed on `mcp` or `admin_mcp` declares one, and [`build-mcp-catalog.test.mts`](../../../../backend/services/mcp-tools/catalog/build-mcp-catalog.test.mts) fails for any that does not.

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

Every mutating tool currently exposed on the user `mcp` surface (`add_entity_relation`,
`add_list_item`, `create_list`, `delete_list`, `manage_my_cards`, `manage_my_point_valuations`,
`manage_my_rewards_statuses`, `manage_my_spending`, `remove_bookmark`, `remove_list_item`,
`set_bookmark`, `update_list`, `update_my_financial_profile`) requires `plan: 'plus'`; every
user-`mcp` read tool stays `'free'`. No production tool requires `'pro'` yet — see the generated
[tool catalog](catalog.md)'s Plan column for the authoritative per-tool value.

---

## Generated Artifacts

[`build-mcp-catalog.test.mts`](../../../../backend/services/mcp-tools/catalog/build-mcp-catalog.test.mts) builds every registry-derived artifact and fails when a committed copy is stale. Run
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
  (`q`, `text_search_query`, `semantic_search_query`) and pages like it (`after`, `limit`,
  `page_info`; see [Paged results](../../../requirements/api/v1/mcp/README.md#paged-results)).
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
returned by the matching `get_my_*` tool. `remove` returns only `{ id }`; see [Structured tool results](../services/mcp-tools/README.md#structured-tool-results).

`add_entity_relation` is MCP-only and uses the same relation command as the session REST route.
REST supplies first-party authority; MCP receives verified delegated credential authority. Public
relations retain ordinary scope policy. Effectively private post work also requires the exact
`post-relations.owned-private:write` grant and matching credential ownership of the candidate and
effective root. Its `add_tag` branch adds one authored `#tag` through the locked PATCH-equivalent
category path described in [Tags](../../../requirements/content/TAGS.md). Its relation result always
returns the canonical subject/predicate/object tuple; `relation_id` is included only for relation
tables that persist a row identifier.

### Bookmark and list write tools

Seven MCP-only tools write the caller's own bookmarks and lists. Each runs the same shared
service command as its REST twin, so the permission, suspension, guard, and ownership rules do not
fork. They require `plan: 'plus'` and the full resource pair (`bookmarks:read` + `bookmarks:write`,
or `lists:read` + `lists:write`); a read-only grant never satisfies the write scope. The existing
per-call MCP audit records every call; there is no separate audit path.

| Tool                                      | REST twin                                                                           | Notes                                                                                                      |
| ----------------------------------------- | ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `set_bookmark`                            | `PUT /api/v1/bookmarks/:entityType/:entityId/:predicate`                            | `predicate` is `save`, `follow`, `mute`, or `block`; idempotent                                            |
| `remove_bookmark`                         | `DELETE /api/v1/bookmarks/:entityType/:entityId/:predicate`                         | Needs no visibility of the target; removing an unset relation changes nothing                              |
| `create_list`                             | `POST /api/v1/lists`                                                                | Every call creates a list, even when the name is taken                                                     |
| `update_list`                             | `PATCH /api/v1/lists/:id`                                                           | Omitted fields are kept; a null `description` clears it                                                    |
| `delete_list`                             | `DELETE /api/v1/lists/:id`                                                          | Soft delete; deleting a deleted list is not found                                                          |
| `add_list_item`                           | `POST /api/v1/lists/:id/items/posts`, `POST /api/v1/lists/:id/items/rss-feed-items` | `item_type` selects the route; adding an existing item returns it                                          |
| `remove_list_item`                        | `DELETE /api/v1/lists/:id/items/posts/:entityId`, `.../rss-feed-items/:entityId`    | Removing an item that is not on the list is not found                                                      |
| `POST /api/v1/lists/:id/import` (no tool) | none                                                                                | Decided against a tool: it needs community-slug resolution and is a bulk operation outside the named tools |

Follow, mute, block, and save are the `is_bookmark` predicates behind the one bookmark route
pair, so one set tool and one remove tool cover them. Muting or blocking removes the follow, as
the REST route does. The other bookmark predicates (`hide`, `subscribe`, `dismiss_recommendation`,
`proxy_follow`, `proxy_mute`) stay REST-only: the tool schema accepts only the four above and
rejects the rest as invalid arguments before any write.

The tools reject a suspended caller before any change, and list tools authorize ownership
(`404` for a missing or deleted list, `403` for another user's list) before mutating. MCP turns a
thrown error into a generic tool failure, so a caller cannot tell those two apart, and repeating a
delete or remove reports a tool error rather than success.

Private posts follow `add_entity_relation`: `set_bookmark` and `add_list_item` reach the caller's
own private post only when the credential also carries the exact
`post-relations.owned-private:write` grant (which itself requires `entity-relations:write`); another
user's private post stays hidden. `remove_bookmark` and `remove_list_item` read and disclose
nothing, so they need no private grant. `add_list_item` applies this post check to credential calls
as well as the list-ownership check, so under delegated credentials it is stricter than the REST
route, which adds a post without a visibility check.

---

## Server-Only Tools Rationale

Tools with `surfaces: ['internal']` are excluded from MCP and client surfaces for one of
these reasons:

- **Internal-only data** — `search_rss_feed_items` reads workflow data that is not exposed
  directly to clients.

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

A tool result that includes member-authored or third-party text must mark that text with
`wrapExternalContent()` from `@jongleberry/vurst-prompt` before returning it to a model; for
example, `get_topic_details` marks topic markdown and `search_posts` and `get_post` mark posts.
