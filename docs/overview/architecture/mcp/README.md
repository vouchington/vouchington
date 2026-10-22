# MCP Tools

Reference for all LLM tool definitions registered in `backend/mcp/registry/`. Tools are
the callable primitives exposed to server-side agents and MCP clients. Native agents connect
to the user MCP server over OAuth, as described in OAuth.

See also:

- [Generated tool catalog](catalog.md)
- [Generated MCP catalog](../../../../api-fixtures/v1/mcp.json)
- [Tool registry source](../../../../backend/mcp/registry/index.mts)
- [Tool type definitions](../../../../backend/services/openai-agents/tool-types.mts)
- [Tool implementation directory](../../../../backend/mcp/)
- [Agents that use these tools](../../../../backend/agents/AGENTS.md)

---

## Audience

A tool declares at most one `meta.audience`. With no audience, the tool is internal-only:
server-side agents can call it, and no external MCP server lists it. The registry test "lists each
tool on exactly one audience" keeps each exposed tool on a single server, and a grant reaches only
that server's tools.

Each audience has its own server so a grant to one audience cannot expose tools from another.
Member actions, community moderation, brand claims, and staff operations cross different trust
boundaries. Authentication and audit policy follow that boundary; the authoritative server fields
and credential rules live in [`config.mts`](../../../../backend/services/mcp-tools/config.mts).

## Suspended callers

Authentication rejects a suspended account on every audience except `user`, where a paying owner or
a `messages:read` holder may continue. The check runs on every request because access-token
validation and refresh do not look at suspension, and a new authorization still rejects a suspended
user. Moderation, brand, staff, and legal servers stay closed to a suspended account. After
authentication, each tool still declares whether a suspended caller may run it.

## Per-call audit

An agent's actions on an account must be answerable. Every server with `auditCalls: true` writes
`mcp_call_audit_events` before the call runs and fails closed: if the rows cannot be stored, the
request returns 503 and the call never runs.

## JSON-RPC batches

A batch has a bounded number of JSON-RPC messages so one request cannot consume unbounded audit
rows or route charges. The limit lives with the route configuration.

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
or a staff write omits its explicit `idempotentHint`. Staff hints describe the shared service:
a guarded no-op can be idempotent, while repeated writes that append audit history are not.
User tool write hints follow `PUT`/`DELETE`, or a required UUID `idempotency_key` for admitted creation.

Each MCP server also sends `instructions` on `initialize`
([`instructions.mts`](../../../../backend/services/mcp-tools/instructions.mts)) so agents learn how the tools fit together before calling them. A result over the MCP response limit returns a tool error that asks the caller to narrow the query or lower the limit.

A tool may set `meta.outputSchema` (JSON Schema, `object` root) so `tools/call` also returns validated `structuredContent`; see Structured tool results. Every tool with a `meta.audience` declares one, and the [static-backend live catalog check](../../../../ci/check-live-mcp-catalog.mjs) fails for any that does not.

---

## Plan Gating

`meta.plan` is the minimum membership required to dispatch a tool. It is enforced only on the `user`
and `community_moderation` audiences (`tools/list` and `tools/call`, through
[`isToolAllowedForPlan`](../../../../backend/mcp/registry/select.mts)). Other audiences are free.
Direct REST routes and internal-agent calls stay outside this gate.

- `'free'` (default when absent) — available to every authenticated caller on those audiences
- `'plus'` — requires Plus or Pro membership
- `'pro'` — requires Pro membership

Native agents use the same user audience over OAuth, so the same plan gate applies: every mutating
tool on the user audience requires a paid plan, and a Free member's in-app agent gets the read tools
only. There is no native exception. Consent always applies. First-party native OAuth clients use the
client IDs `<site origin>/api/v1/oauth/native-clients/ios`, `/macos`, and `/windows`; see the OAuth
documentation for redirects and authorization.

Direct messages require exact private-data grants; umbrella scopes exclude them. Reads remain
available for Free and suspended members; writes require Plus and an active account. Member text is
sanitized and fenced. AI chat transcripts remain outside this grant.

Every mutating tool on the user and community-moderation audiences declares a paid plan; every read
on those audiences stays `'free'`. The generated [tool catalog](catalog.md) Plan column is the
per-tool value.

---

## Community moderator actions

Exact community-moderation grants keep moderator capabilities out of umbrella-granted apps.
Post locks, ban-evasion confirmation, and moderator notes share the existing moderator write
tools because their scope, plan, and conservative hints agree. Each option retains its REST
permissions: locking checks post visibility and the caller's community role; note access permits
moderation staff or moderators of any community before applying the note's own community rules;
ban-evasion confirmation remains staff-only. This avoids making MCP moderation stricter than REST.

Member modmail shares `participate_in_community` with joining because those actions share scope,
plan, and conservative hints. Its strict option envelope makes the action explicit while keeping
`apply_to_community` separate for its different idempotency contract. Active members retain REST
access in private or archived communities, and thread subjects retain reply access after membership
removal. Moderator thread access and subject selection also follow REST.

## Brand topic claims

The brand server is a separate MCP audience at `/api/v1/brand/mcp`. It is free: there is no plan
gate, and the plan field stays unset rather than defaulting to the user-surface `'free'` value.
Exact `topic-claims:read` and `topic-claims:write` grants are required; umbrella user grants do
not include them. `read_my_topic_claims` lists and reads the caller's own claims. `manage_topic_claim`
files a claim, issues a verification token, checks published domain proof, or submits evidence for
staff review. An agent never awards ownership. Ownership follows domain proof or staff review, the
same as the topic-claim REST routes.

## Generated Artifacts

The `static-backend` CI gate runs the [live registry contract check](../../../../ci/check-live-mcp-catalog.mjs) and `pnpm run mcp:catalog -- --check` for the committed artifacts. Run `pnpm run mcp:catalog` from the repository root after adding or modifying tools to regenerate them.

- [`api-fixtures/v1/mcp.json`](../../../../api-fixtures/v1/mcp.json) — each server's endpoint and the full `tools/list` entry, minimum plan, roles, and REST equivalent per tool
- [`catalog.md`](catalog.md) — the generated tool table between its `BEGIN GENERATED` and `END GENERATED` markers
- [`api-fixtures/v1/mcp-results.json`](../../../../api-fixtures/v1/mcp-results.json) — versioned MCP result cases with tool arguments and structured results validated against the catalog schemas
- [`api-fixtures/v1/mcp-date-time.json`](../../../../api-fixtures/v1/mcp-date-time.json) — shared date-time acceptance cases for the producer and native clients

The live check asserts that each server's catalog equals what `tools/list` returns to a caller
holding every role, the Pro plan, and every scope, that every listed tool has a title and output schema,
and that hints agree with their REST equivalents (see [MCP Metadata](#mcp-metadata)). The `docs-publish` workflow renders
`mcp.json` with [`ci/render-mcp-docs.mts`](../../../../ci/render-mcp-docs.mts) onto the credentialed
private docs site at `/mcp/`, alongside the PostgreSQL reference.

---

## Parameter Conventions

- **Topics** — topic lookup parameters (`topic_id`, `topic_id_a`, `topic_id_b`) take a UUID or
  slug, like the REST `:idOrSlug` routes, and results return the resolved topic UUID. A value that
  names no topic returns `{ success: false, error: 'Topic not found' }`. The search tools'
  `similar_topic_id` is a similarity-search seed and takes a UUID, and write-tool fields that
  mirror a REST request body (such as `manage_my_cards.card_topic_id`) take what that body takes.
- **Search queries** — a tool with a REST equivalent names its query after the REST parameter
  (`q`, `text_search_query`, `semantic_search_query`) and pages like it (`after`, `limit`,
  `page_info`; see Paged results).
- **Post types** — a `post_type` enum accepts the same values as its REST equivalent:
  `VALID_FILTERABLE_POST_TYPES` for `GET /api/v1/posts` and `VALID_TRENDING_POST_TYPES` for
  `GET /api/v1/trending-posts` (both in `ts-shared/feed-capabilities`).
- **Alternatives** — `get_domain_ratings` takes exactly one of `url` or `hostname`; its schema
  enforces this with `minProperties`/`maxProperties`, which MCP argument validation checks.

### Merged tools

A merged tool is one MCP name whose input is `{ option, arguments }`. Every option in that tool
shares its identity metadata (audience, scopes, plan, and hints). The `manage-my-*` tools below
keep their own `action` enum.

### `manage-my-*` tools (`action` enum → REST verb)

Tools created with `createManageEntityTool()` dispatch on an `action` parameter rather than
exposing separate tools per write operation. The mapping to REST verbs is:

The `add`, `update`, and `remove` actions correspond to POST, PATCH, and DELETE on
`/api/v1/my/…`, respectively. The `id` parameter is required for update and remove; use the row
UUID from the matching `get_my_*` tool. Remove returns only `{ id }`.

`add_entity_relation` has no dedicated REST endpoint and uses the same relation command as the
session REST route.
REST supplies first-party authority; MCP receives verified delegated credential authority. Public
relations retain ordinary scope policy. Effectively private post work also requires the exact
`post-relations.owned-private:write` grant and matching credential ownership of the candidate and
effective root. Its `add_tag` branch adds one authored `#tag` through the locked PATCH-equivalent
category path described in Tags. Its relation result always
returns the canonical subject/predicate/object tuple; `relation_id` is included only for relation
tables that persist a row identifier.

`manage_bookmark(set)`, `manage_bookmark(remove)`, and the five list write tools follow the same delegated-authority
model; see Bookmark and List Write Tools. `remove_entity_relation` and
the referral link and topic recommendation tools do too; see Relation, Referral Link and Topic Recommendation Write Tools. So do the eleven profile, notification, and preference tools: Profile, Notification, and Preference Write Tools. Post creation, replies, edits, archive and deletion use Post and Comment Write Tools. Community creation, joining, leaving and applying, content reports, review disputes and moderation appeals use Community, Report, Dispute and Appeal Tools. The read tools are in Hostname, List and User Read Tools, Trending, Referral, Search and Reference Read Tools, Community List, List Membership and Membership Plan Read Tools, and Own Profile, Notification, Preference and Recommendation Read Tools.

---

## Server-Only Tools Rationale

Tools with no `meta.audience` are excluded from external MCP servers for one of these reasons:

- **Internal-only data** — `search_rss_feed_items` reads workflow data that is not exposed
  directly to clients.

---

## External Content

A tool result that includes member-authored or third-party text must mark that text with
`wrapExternalContent()` from `@jongleberry/vurst-prompt` before returning it to a model; for
example, `read_topic(details)` marks topic markdown and `read_posts(search)` and `read_posts(details)` mark posts.

## Date-time compatibility

MCP date-time validation shares one acceptance contract with native clients so tool results cannot
pass the server boundary and fail only in an app. Leap seconds use the structural UTC month-end
placement rule from [RFC 3339 section 5.7](https://www.rfc-editor.org/rfc/rfc3339#section-5.7),
including the UTC date after applying a numeric offset. This checks possible placement; it does
not verify that IERS announced an insertion, predict future insertions, or authorize generating
unannounced leap-second timestamps. Other accepted syntax and calendar validation remain owned
by Ajv's full date-time format. The shared generated fixture keeps this boundary explicit without
introducing an announcement table or a network dependency.

## Entity references

A tool input names a topic, post, RSS feed, community, or user with one string. Resolution tries the id, then the slug, then the exact name. A slug includes a topic alias and the slug of a merged source, and it wins over another row's name. A name matches the stored name with case folded, not an alias and not a partial string. A reference the caller cannot see resolves the same way as a reference that names nothing. Resolving many references of one entity type reads the database once. An output carries the canonical id and the slug when the entity has one. Authorization stays on the primary guard that already answers the missing row.
