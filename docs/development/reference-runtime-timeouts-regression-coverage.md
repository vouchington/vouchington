# Regression coverage

[Back to Runtime Timeouts](runtime-timeouts.md#regression-coverage)

- `backend/modules/utils/http-dispatchers.test.mts` — pins both dispatcher profiles and verifies
  their shared guardrail, shutdown, and reset lifecycle.
- `backend/entrypoints/api/serve.test.mts` — asserts the explicit `http.createServer` timeout
  values and that `server.timeout` is not set.
- `backend/api/__tests__/sse-route-architecture.test.mts` — requires every production
  `startSSE(ctx)` route to stay in the canonical SSE route inventory, so new served SSE routes
  cannot bypass the documented connection-cycle and client-recovery review.
- `web/app/(my)/my/data/__tests__/data-request-section.part-2.mock.test.tsx` — asserts the
  data-request client stays open (native reconnect) on a non-terminal timeout cycle, and closes
  only once the durable status is terminal.
