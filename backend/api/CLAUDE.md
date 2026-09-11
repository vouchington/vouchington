# API Routes

Agent-only rules for editing `backend/api/**`. Reference material lives in [README.md](./README.md)
and the route-local `README.md` files and, where present, linked `reference-*.md` leaves under
`v1/**`.

Before adding or changing a webhook or other inbound-event route, load the
[event-ingress-routing skill](../../.agents/skills/event-ingress-routing/SKILL.md) — it decides
whether the route belongs on the public endpoint at all and what "self-contained auth" requires
of the handler.

## Rules

- All business logic lives in `@services/*`. Routes are thin controllers: parse params/body, call services, shape the response.
- Do not create `backend/api/**/shared/**` directories — move reusable business logic to `backend/services/**`.
- Use `requireAuth`, `getOptionalAuthAndRateLimit`, or `requireAuthAndRateLimit` from `response-helpers.mts` instead of hand-rolling the preamble. Do not call `ctx.getCurrentUser()` / `ctx.applyRouteRateLimit()` directly unless the route has an unusual preamble (document why).
- The canonical 401 message is `'Unauthorized'` — do not use `'User not logged in'`, `'Not authenticated'`, or `'Authentication required'`.
- Use service-layer `currentUserCan*` authorization helpers rather than route-local permission logic.
- New mutation routes (`POST`/`DELETE`/`PATCH`) must apply the domain's full guard set, not just `requireAuth` — call `assertNotSuspended` from `@services/users`, then the domain's `currentUserCan*` gate, and enforce domain limits (caps, target-user existence, block/mute). For messaging routes, follow the cross-file contract summary in [backend/services/messaging/authorization.mts](../services/messaging/authorization.mts) and verify a rejection-path integration test exists for each guard.
- Return wrapped responses matching patterns in [README.md](./README.md). Return election summaries as top-level sidecars, never nested inside entity payloads.
- Set logged-out `Cache-Control` headers for public, non-personalized GET endpoints.
- Use `@services/entity-cache` getters for entity reads; use cached search wrappers for logged-out list/search endpoints.
- Use batch functions (`*CachedBatch()`, `*Batch()`) for list endpoints — never single-entity lookups in a loop.
- Database-backed list routes must expose the canonical opaque cursor contract; see [Cross-Surface Cursor Pagination](../../docs/overview/architecture/pagination.md).
- Preserve the route-local `README.md` `## Performance` heading; `no-mistakes check` enforces it.
  When it links `reference-performance.md`, document round trips, cache hits, and `Cache-Control`
  headers in that leaf; otherwise its inline section is canonical.
- When an endpoint changes, preserve its route-local `README.md` headings. Update a linked
  `reference-*.md` leaf where present; otherwise update the README's inline details.
- Add or update tests for route behavior you changed.
- Feature flags must not gate API endpoints — APIs should always be available; flags are frontend-only. Remove any `getFeatureFlagsFromCookie` checks that throw 404.
- Use `ctx.throw(status, message)` for HTTP errors; use `ctx.throw(status, message, code)` when clients branch on the error code. Import error-code constants from `@modules/on-error/error-codes`.

## SSE Streams

- Use `startSSE(ctx)` from `sse-helpers.mts` so headers, `X-Accel-Buffering`, socket `setNoDelay`, and disconnect detection stay consistent across routes.
- Treat only `ECONNRESET` and `ERR_STREAM_PREMATURE_CLOSE` as benign client disconnects from the stream pipeline. Non-disconnect stream errors must reach `onError`; do not add broad empty catches around stream failures.
- Close pub/sub subscriptions in `finally` or equivalent disconnect cleanup. Reconnect paths must recover from durable state, not from Valkey pub/sub history.
- New/changed SSE endpoints should cap `timeoutMs` short (see the data-request stream) and rely on the client's native `EventSource` reconnect, per the Fargate Spot degradation principle in [docs/development/runtime-timeouts.md](../../docs/development/runtime-timeouts.md#principle-sse--long-lived-connection-duration-under-fargate-spot). Do not add a named-`error`-then-terminal-close client handler for a routine timeout cycle — see that doc's SSE compliance table for known exemptions.

## Route Helpers (`response-helpers.mts`)

Use the canonical helper inventory and return contracts in
[README.md § Route Helpers](README.md#route-helpers). Do not duplicate their implementation or
hand-roll equivalent authentication, rate-limit, UUID, or JSON-body preambles.

## RESTful API Design

Route paths use resource nouns, not action verbs. Model actions as sub-resource creation, not RPC. Automated replacement coverage for this policy is tracked in the static-analysis migration milestone. PATCH endpoints modify only the resource in the URL; do not use `{ action: 'verb' }` in PATCH bodies.

## See Also

- Route package catalog: [catalog/README.md](catalog/README.md)
- API reference: [README.md](./README.md)
- Backend context: [../CLAUDE.md](../CLAUDE.md)
- Services: [../services/CLAUDE.md](../services/CLAUDE.md)
