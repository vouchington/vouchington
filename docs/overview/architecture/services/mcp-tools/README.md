# MCP Tools Service

Source entrypoint: [backend/services/mcp-tools/README.md](../../../../../backend/services/mcp-tools/README.md)

Implements the MCP (Model Context Protocol) server logic: listing tools, executing tool calls, and handling stateless HTTP requests using the MCP SDK.

## Modules

| File                                 | Description                                                                                  |
| ------------------------------------ | -------------------------------------------------------------------------------------------- |
| `config.mts`                         | User/admin MCP server names, routes, surfaces, OAuth audiences, API-key and audit policy     |
| `authenticate.mts`                   | Verify a bearer OAuth access token, or a user MCP API key where the route accepts keys       |
| `audit.mts`                          | Durable per-call audit context and the one batched `mcp_call_audit_events` insert            |
| `classify-calls.mts`                 | Map a parsed JSON-RPC body to audit events without keeping arguments, results, or raw names  |
| `challenge.mts`                      | Build RFC 6750 and RFC 9728 `WWW-Authenticate` challenges                                    |
| `resolve-tool-call.mts`              | The ordered role, plan, and scope policy, plus step-up scope discovery                       |
| `list-tools.mts`                     | Filter registered tools by configured surface and `resolve-tool-call.mts` policy             |
| `call-tool.mts`                      | Execute a tool call with full authorization enforcement                                      |
| `serialize-mcp-tool-result.mts`      | Bounded JSON serializer for MCP tool results                                                 |
| `build-tool-result.mts`              | Build the `tools/call` result; validate and attach `structuredContent` for declared schemas  |
| `schema-validator.mts`               | The one Ajv setup for tool arguments and output schemas                                      |
| `handle-request.mts`                 | Stateless per-request MCP transport using `WebStandardStreamableHTTPServerTransport`         |
| `instructions.mts`                   | Per-surface server `instructions` sent on `initialize`                                       |
| `index.mts`                          | Barrel: exports request handlers, helpers, and user/admin MCP configs                        |
| `catalog/build-mcp-catalog.mts`      | Build the `api-fixtures/v1/mcp.json` catalog and find `meta.api` routes missing from OpenAPI |
| `catalog/agent-tool-catalog.mts`     | Render the agent-tools catalog table and the native-client `manifest.json`                   |
| `catalog/output-schema-ratchet.mts`  | Frozen list of listed tools that still return text only; it can only shrink                  |
| `catalog/build-mcp-catalog.test.mts` | Snapshot every generated catalog artifact; `pnpm run mcp:catalog` regenerates them           |

`catalog/find-api-hint-conflicts.mts` finds tools whose MCP hints disagree with the REST operations
in `meta.api`; see [MCP Metadata](../../agent-tools/README.md#mcp-metadata).

## Structured tool results

A tool declares `meta.outputSchema` (JSON Schema, object root) and `toolToMcpTool` publishes it as
`outputSchema` in `tools/list` and in the generated `api-fixtures/v1/mcp.json` catalog. For such a
tool `callMcpTool` delegates to `build-tool-result.mts`, which:

1. serializes the result with the bounded serializer, capped at half the response limit because the
   JSON goes out twice, then parses it back, so the schema check sees exactly what the client gets
   (an `undefined` property is gone, a `Date` is its ISO string);
2. checks that value against the output schema with the same Ajv setup as argument validation;
3. returns `structuredContent` plus the same JSON in one `text` block;
4. measures the assembled response against the full 1 MiB bound, so escaping counts.

An oversized response becomes the existing "too large" `isError` text and is not reported. A value
the schema rejects throws `McpToolOutputMismatchError` (tool name and failing path, never the
value); the call path reports it through `onError` and returns the generic tool-failure result,
never `structuredContent`. Tools without an output schema keep the text-only result, held to the same
whole-response bound (step 4), so JSON escaping counts for them too.

**One source of truth.** The generated `api-fixtures/v1/request-contracts.json` carries a
`responses` map with the response schema of every route whose 200 body is a named response type,
keyed like `operations`, and a `components` map of every named type. `route-response-schema.mts` in
`backend/tools` resolves an entry into a self-contained schema (recursive components stay a `$ref`
into a root `$defs`). `createGetMyEntityListTool` derives its `{ success, result }` schema from its
single `meta.api` endpoint this way. A tool that reshapes the REST body, or has no REST twin, owns
its schema, built from those components and the shapes in `output-schema-shapes.mts`, with a test
that pins it to `openapi.json` where documented (`output-schema-pins.test.mts`).
A route that documents its response inline has no contract; give it a named response type, run
`pnpm run openapi:generate`, and then derive the tool's schema.

**Normal failure results.** A lookup tool that returns a miss (`{ success: false, error }` or
`{ found: false, error }`) rather than throwing must admit that shape, or the miss fails
validation; `outcomeSchema` builds both. `manage_*` tools return only `{ id }` for `remove`,
because REST `DELETE` is `204`.

**Ratchet.** `catalog/output-schema-ratchet.mts` names the listed tools that still lack a schema.
Its test compares the list with the generated catalog in both directions and caps its length, so a
converted tool must leave the list and a tool newly exposed on `mcp` or `admin_mcp` must declare a
schema instead of joining it.

## Authorization

Each `tools/call` request re-enforces the same checks as `tools/list`:

1. Tool surface must match the route config: `mcp` for `/api/v1/mcp`, `admin_mcp` for `/api/v1/admin/mcp`
2. Role check (`isToolAllowedForUser`)
3. Plan check (`isToolAllowedForPlan`)
4. Scope check: every surfaced tool declares nonempty canonical required scopes; missing scopes
   hide the tool and reject direct calls.

`authorizeMcpTool` in `resolve-tool-call.mts` is the single policy for both, so listing and calling
cannot disagree. When a single OAuth `tools/call` fails only on scope, the route answers `403
insufficient_scope` with the scopes to re-authorize with; every other denial stays an in-band
JSON-RPC error.

Route admission verifies only that the credential is for the user or admin audience. Role, plan,
ownership inside a tool, and scope remain independent checks. Legacy `mcp.user:*` grants remain a
compatible superset while resource-scoped credentials are preferred.

## Admin MCP is OAuth-only

`McpServerConfig.acceptsApiKeys` is `true` for the user route and `false` for the admin route.
`authenticateMcpBearer` always tries OAuth first (`validateOAuthAccessToken`, which owns expiry,
revocation of the token, grant, and client, user deletion or suspension, and the exact protected
resource) and reaches the API-key path only when the route accepts keys. An API key sent to
`/api/v1/admin/mcp` therefore fails as an unrecognized credential: `401` with an `invalid_token`
challenge. `mcp.admin:read` and `mcp.admin:write` accept only the `oauth` scope surface, so API-key
creation rejects them too.

A verified token then needs the `administrator` role (`403`, `role_denied`), at least one
admin-audience scope (`403`, `insufficient_scope`, with a challenge naming `mcp.admin:read`), and
the scope each tool declares (`tools/list` hides tools the token cannot call; a direct call gets the
`403` step-up challenge).

## MCP audit log

Every call a verified principal makes to the user or admin route writes an append-only
`mcp_call_audit_events` row before it runs (`McpServerConfig.auditCalls`, on for both routes). The
principal is an OAuth access token on either route, or an API key on the user route. The table is
range-partitioned by UUIDv7 `id`, so `occurred_at` is a virtual column derived from the id.

| Column                                   | Contents                                                                                                                                                               |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `actor_user_id`                          | Credential owner, through `retained_user_identities`, so the record survives hard deletion                                                                             |
| `oauth_client_id`, `api_key_id`          | Exactly one is set (a `CHECK`): a foreign key to the OAuth client the token was issued to, or to the API key's `retained_api_key_identities` row                       |
| `resource`                               | Protected resource URL of the route called                                                                                                                             |
| `surface`, `jsonrpc_method`, `tool_name` | `mcp` or `admin_mcp`, the allowlisted JSON-RPC method, and the registered tool name; `NULL` when there is nothing to record                                            |
| `outcome`                                | `accepted`, `tool_error`, `invalid_request`, `invalid_arguments`, `not_found`, `role_denied`, `plan_denied`, `scopes_undeclared`, `insufficient_scope`, `rate_limited` |
| `correlation_id`                         | Server-minted per request and returned as the `X-Correlation-Id` response header                                                                                       |

- **One row per JSON-RPC message.** A batch writes its rows in order under one correlation id in a
  single insert; a batch above 25 messages is refused with `413` and one `invalid_request` row.
  Rejections before the body is read (role, scope, rate limit, unreadable body) write one row with a
  `NULL` method. An admitted tool call that then fails also writes a `tool_error` row.
- **Redaction by construction.** The schema has no column for tokens, API keys, headers, arguments,
  or results, and `tool_name` holds only names registered on the surface, never caller-supplied
  text. Nothing is scrubbed after the fact.
- **Fail closed.** The write happens before the call, so if it fails the request ends `503` and the
  call never runs. The `tool_error` follow-up is best effort, because the call already ran.
- **Unauthenticated requests write no row.** A request that fails authentication (`401`) or the
  content-type check (`415`) has no verified actor or credential to record; `401` is observable in
  the request logs instead.
- **API keys are recorded by id.** The key's `api_keys.id` is also its retained identity id, so the
  row names the key without holding the secret, its hash, or its label.

Rows are append-only (a trigger rejects `UPDATE` and `DELETE`), so the foreign keys cannot cascade
or null out. The OAuth client is never deleted with its owner. An API key is deleted with its
owner, so `api_key_id` targets `retained_api_key_identities` with `ON DELETE RESTRICT`: account
deletion removes the live key and never touches the audit row, and
[retained-identity cleanup](../data-retention/README.md#key-exports) removes a key's root only when
no audit row names it.

## Related

- Registry: [tools registry](../../../../../backend/tools/registry/)
- API: [MCP API](../../../../../backend/api/v1/mcp/)
- API Keys: [api-keys service](../../../../../backend/services/api-keys/)
