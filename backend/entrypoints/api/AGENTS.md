# API entrypoint

- Add context helpers through `app.extend()` in [`backend/api/context`](../../api/context/).
- Order handlers: authenticate/authorize → resolve URL entities → parse/validate body → act. Prefer `ctx.assert` for HTTP assertions.
- Body-bearing mutations use `application/json`; urlencoded/multipart are forbidden except signed unsubscribe routes' declared form-urlencoded metadata. Follow [CSRF requirements](../../../docs/requirements/security/CSRF.md).
- Call `ctx.setStatus(N)` before non-200 JSON. Empty 204/205 responses set status without `ctx.json({})`.
- Import `@queues/*` enqueue APIs, never `@workers/*`, CPU-only `sharp`/`@jongleberry/vurst-ai`, or worker-only `web-push`, `pg-copy-streams`, `@aws-sdk/client-bedrock`; preserve no-mistakes entrypoint/closure guards.
- Bootstrap `enableApiEgressGuardrail()` only here, never in worker entrypoints. Off-allowlist direct egress reports `egress_guardrail:off_allowlist` to Sentry in warn-only mode. IPv4 integrations use provider-scoped API egress proxies.
- Keep route registration lightweight using [candidate sub-app groups](../../../docs/overview/architecture/backend/README.md); apply [API route rules](../../api/AGENTS.md).
- The GlideMQ dashboard event stream ends through `armDashboardEventStream` on the shared SSE cycle and does not emit a named error event. Queue state stays in the queue; dropped live event lines are an accepted loss. Do not arm the package job-output route; it already ends after a bounded read. Follow [SSE bounds](../../../docs/development/runtime-timeouts.md#principle-sse--long-lived-connection-duration-under-fargate-spot).
