# API routes

- Load skills: `http-api-design`, `security-rules`.
- Route contracts: [API requirements](../../docs/requirements/api/README.md).
- Reusable business logic belongs in services; never add `backend/api/**/shared/**`.
- Use `requireAuth`, `getOptionalAuthAndRateLimit`, or `requireAuthAndRateLimit` from
  `response-helpers.mts`, and its UUID/JSON helpers. Direct `ctx.getCurrentUser()`/
  `ctx.applyRouteRateLimit()` need a documented unusual preamble. Canonical 401 text is `Unauthorized`.
- Prefer `ctx.assert` for HTTP assertions.
- Authorize through service `currentUserCan*` helpers. POST/DELETE/PATCH routes also call
  `assertNotSuspended` and enforce domain caps, target-user existence, block/mute, and other
  applicable guards. Messaging follows `services/messaging/authorization.mts`, with
  rejection-path integration coverage for every guard.
- Body-bearing mutations are JSON-only except the signed unsubscribe routes' declared
  form-urlencoded metadata.
- Preserve wrapped response contracts; election summaries are top-level sidecars, never nested
  entity data. Use `ctx.throw(status, message[, code])` with `@modules/on-error/error-codes` when
  clients branch on codes.
- New PUT vote routes use `createVoteHandler()` (`election-vote-handler.mts`).
- Public non-personalized GETs set logged-out `Cache-Control`. Entity reads use
  `@services/entity-cache`; logged-out lists/search use cached wrappers.
- SSE uses `startSSE(ctx)` with a short `timeoutMs` and native `EventSource` reconnection; routine
  timeout cycles are not named-error terminal closes.
