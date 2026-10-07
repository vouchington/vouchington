# Rate Limiting reference

[Back to Rate Limiting](rate-limiting.md)

## MCP tool calls and REST route limits

A `tools/call` is charged to the per-route bucket of the REST route its tool lists in `meta.api`, so
a user has one budget per route across both protocols. The transport bucket and the
[usage quota](reference-rate-limiting-layer-4-per-route-rate-limiting-backend.md#mcp-usage-quota)
of [Layer 4](reference-rate-limiting-layer-4-per-route-rate-limiting-backend.md) are unchanged and
still apply to the request.

- **Identity**: the same as the transport bucket: the request IP and the credential's rate-limit
  identity, with the credential owner. An OAuth credential carries the user id, so it shares
  `uid:{uid}:{routePrefix}` with that user's REST session requests. An API key carries only its key
  id, so its calls share the `ip:` and `apikey:` keys with that key's REST requests, not the user's
  `uid:` key.
- **Unit**: one tool call, not one HTTP request. A JSON-RPC batch of N calls charges N times, in
  order, and a spent bucket refuses only the calls that find it spent. The 25-message batch limit
  (HTTP 413) applies to every MCP request, since it bounds the charging work.
- **Charged calls**: a call that will run, with a known tool, allowed scopes and valid arguments, and
  a request id. A call refused before it runs (unknown tool, denied, invalid arguments), a
  notification, and a request that must step up to broader scopes charge no route. They still count
  against the transport bucket. REST charges before it validates the body, so MCP is not stricter.
- **Several routes**: a call is charged for the routes it exercises. A tool whose arguments pick
  among its `meta.api` routes declares `meta.selectApi` to name them: the `manage_my_*` tools by
  `action`, `add_list_item`, `remove_list_item` and `get_community_list_items` by `item_type`,
  `add_entity_relation` by `action`, and `create_post` by whether `community_id` is present (the
  community route when it is, `POST /api/v1/posts` when it is not). Where the call does not tell,
  each listed route is charged once: `get_my_profile` calls all three of its routes. The admin
  `{id}` and user `:id` spellings of a path parameter name one bucket, and a repeated route is
  charged once.
- **Refusal**: a call that finds a bucket spent does not run. It returns the tool-level rate-limit
  error in the JSON-RPC result, `isError: true` with `status` 429, `code` `RATE_LIMIT`,
  `retryable: true` and `retryAfterSeconds` set to the window `Retry-After` would carry on REST. It is
  not an HTTP 429: the response also carries the results of the other calls of its batch. The audit
  row records `rate_limited`, not `tool_error`, and carries no copyright rationale, which the audit
  table stores only for an accepted call. A request whose every JSON-RPC message is rate limited
  charges zero usage-quota units even though its HTTP status is 200. A mixed batch costs one unit.
- **No REST twin**: a tool with no `meta.api` is charged to the transport bucket alone. A registry
  test requires every `mcp` and `admin_mcp` tool to declare `meta.api`, except for a reviewed list of
  read-only tools with no REST route.
- **Failure**: the charge fails open on a Valkey error, and the `enabled` kill switch turns it off, as
  for REST.
- **Deferred**: per-OAuth-client buckets and `RateLimit-*` headers, as for the
  [MCP usage quota](reference-rate-limiting-layer-4-per-route-rate-limiting-backend.md#mcp-usage-quota).

**Files:** `backend/api/mcp-route-rate-limit-helpers.mts`,
`backend/services/mcp-tools/tool-route-keys.mts`, `backend/services/mcp-tools/classify-calls.mts`,
`backend/services/mcp-tools/rate-limited-result.mts`
