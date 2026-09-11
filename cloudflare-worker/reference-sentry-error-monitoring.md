# Sentry Error Monitoring

[Back to Cloudflare Worker](README.md#sentry-error-monitoring)

Sentry is initialized via [`src/sentry.mts`](src/sentry.mts) using `@sentry/cloudflare`.

- **DSN:** hardcoded in [`src/sentry.mts`](src/sentry.mts) (project `4511154639077376`)
- **Initialization:** `withSentry(createSentryOptions, worker)` in [`src/index.mts`](src/index.mts) wraps the handler in-place for per-request initialization, distributed tracing, and automatic flushing via `context.waitUntil`
- **Enabled:** only when `ENVIRONMENT` is `staging` or `production`, via the shared fail-closed
  `resolveSentryEnablement()` gate (`ts-shared/utils/sentry-deployment-gate.mts`) — silent in dev,
  CI, and test (options return `enabled: false`). Independent of `PRODUCTION`, which only gates
  HSTS/strict-mode; see [reference-production-mode.md](reference-production-mode.md).
- **Release:** `GIT_COMMIT` env var (set at deploy time via `wrangler deploy --var GIT_COMMIT:$(git rev-parse HEAD)`)
- **Error capture:** only origin fetch failures (502s) via `captureWorkerException()` in the origin `fetch()` catch block. Expected edge responses (geo-blocks=403, rate limits=429, WebSocket errors=400) return via `edgeErrorResponse()` and never throw.
- **Request-metadata scrubbing:** `beforeSend`, `beforeSendTransaction`, and `beforeSendSpan` remove
  URL query strings/fragments and redact credential headers and cookies before transmission.
- **Tunnel:** the `POST /monitoring` Sentry tunnel ([`src/sentry-tunnel.mts`](src/sentry-tunnel.mts)) is allowlisted for both the web project (4507688156856320) and this worker project (4511154639077376). The backend project sends directly to Sentry and is intentionally excluded from the tunnel.
