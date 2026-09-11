# API Entrypoint

Entry point for the API container. Registers routes, middleware, and context helpers.

## Rules

- All context helpers must be added in [`backend/api/context/`](../../api/context/) using `app.extend()`.
- Request handling order: check authentication & authorization → check entities from URL params → check and parse request body → perform actions.
- Prefer `ctx.assert` over `if (x) throw createHttpError(...)`.
- `urlencoded` and `multipart` request bodies are not allowed except the signed unsubscribe routes.
  State-changing requests must send `application/json`; api-server enforces this for body-bearing
  mutations by default. The unsubscribe routes declare their form-urlencoded exception in route
  metadata. See
  [docs/requirements/security/CSRF.md](../../../docs/requirements/security/CSRF.md).
- Use `ctx.setStatus(N)` before `ctx.json(...)` for non-200 status codes. Use `ctx.setStatus(204)` for empty 204 responses — no `ctx.json({})` needed (same for 205).
- The API entrypoint may import `@queues/*` enqueue APIs, but must not import `@workers/*`.
- The API entrypoint must not import CPU-worker-only modules: `sharp` or `@jongleberry/vurst-ai`. It also must not import worker-only npm modules: `web-push`, `pg-copy-streams`, `@aws-sdk/client-bedrock`. The no-mistakes rules `lightweight entrypoints must not reach worker-cpu-only modules`, `api entrypoint must not reach worker-only npm modules`, and `api workspace closure excludes worker-only packages` enforce this (`pnpm run no-mistakes`).
- Egress guardrails: bootstrap calls `enableApiEgressGuardrail()` (never the worker entrypoints — they legitimately egress to arbitrary IPv4-only hosts). Off-allowlist direct-egress hosts are reported to Sentry tagged `egress_guardrail:off_allowlist`; warn-mode only, it never blocks. API integrations requiring IPv4 use their provider-scoped API egress proxy transport.

## Route Groups (`backend/api/v1/index.mts`)

Use the candidate sub-app grouping in [README.md § Route Groups](README.md#route-groups) when moving
or splitting route registration. Keep the entrypoint import boundary lightweight.

## See Also

- API routes: [../../api/CLAUDE.md](../../api/CLAUDE.md)
- Backend context: [../../CLAUDE.md](../../CLAUDE.md)
