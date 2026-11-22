# API routes

- Load skills: `http-api-design`, `security-rules`.
- Route contracts: [API requirements](../../docs/requirements/api/README.md).
- Reusable business logic belongs in services; never add `backend/api/**/shared/**`.
- Use `requireAuth`, `getOptionalAuthAndRateLimit`, or `requireAuthAndRateLimit` from
  `response-helpers.mts`, and its UUID/JSON helpers. Direct `ctx.getCurrentUser()`/
  `ctx.applyRouteRateLimit()` need a documented unusual preamble. Canonical 401 text is `Unauthorized`.
- Order handlers: authenticate/authorize → resolve URL entities → parse/validate body → act.
  Prefer `ctx.assert` for HTTP assertions.
- Authorize through service `currentUserCan*` helpers. POST/DELETE/PATCH routes also call
  `assertNotSuspended` and enforce domain caps, target-user existence, block/mute, and other
  applicable guards. Messaging follows `services/messaging/authorization.mts`, with
  rejection-path integration coverage for every guard.
- Body-bearing mutations use `application/json`; urlencoded/multipart are forbidden except the
  signed unsubscribe routes' declared form-urlencoded metadata.
- Call `ctx.setStatus(N)` before non-200 JSON. Empty 204/205 responses set status without `ctx.json({})`.
- Preserve wrapped response contracts; election summaries are top-level sidecars, never nested
  entity data. Use `ctx.throw(status, message[, code])` with `@modules/on-error/error-codes` when
  clients branch on codes.
- New PUT vote routes use `createVoteHandler()` (`election-vote-handler.mts`).
- Public non-personalized GETs set logged-out `Cache-Control`. Entity reads use
  `@services/entity-cache`; logged-out lists/search use cached wrappers.
- APIs remain available regardless of frontend feature flags; never gate an endpoint on one.
- SSE uses `startSSE(ctx)`. Only `ECONNRESET` and `ERR_STREAM_PREMATURE_CLOSE` are benign pipeline
  disconnects; other errors reach `onError`. Close pub/sub subscriptions on disconnect/finally and
  recover reconnects from durable state. Use short `timeoutMs` with native `EventSource`
  reconnection; routine timeout cycles are not named-error terminal closes.
