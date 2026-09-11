# Cross-tier observation

[Back to Runtime Timeouts](runtime-timeouts.md#cross-tier-observation)

Browser SSE clients use relative `EventSource('/api/v1/.../stream')` paths. Next.js does **not**
rewrite `/api/*` (only Storybook's dev proxy does), so SSE requests are routed by infra directly to
the backend — the Next.js/web undici dispatcher is not in the SSE request path at all. Within the
backend, `startSSE` owns a clean bounded lifecycle and `pipeChannelToSSE` only writes on pub/sub
events. Routine cycle expiry emits no named error event, so native `EventSource` retry treats it
like any other dropped connection.
