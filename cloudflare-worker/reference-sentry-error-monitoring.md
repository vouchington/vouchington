# Sentry Error Monitoring

[Back to Cloudflare Worker](README.md#sentry-error-monitoring)

Sentry is initialized via [`src/sentry.mts`](src/sentry.mts) using `@sentry/cloudflare`.

- **DSNs:** `SENTRY_DSN` configures the Worker SDK. `SENTRY_WEB_DSN` configures browser monitoring through web runtime-public config and is trusted by the tunnel. During browser DSN rotation, deploy the replacement as `SENTRY_WEB_DSN` with the retiring value in `SENTRY_TUNNEL_PREVIOUS_WEB_DSN`, then remove the latter after the browser rollout. All three are public identifiers configured as ordinary environment values.
- **Initialization:** `withSentry(createSentryOptions, worker)` in [`src/index.mts`](src/index.mts) wraps the handler in-place for per-request initialization, distributed tracing, and automatic flushing via `context.waitUntil`
- **Enabled:** only when `ENVIRONMENT` is `staging` or `production` and `SENTRY_DSN` is valid, via
  the shared `resolveSentryDsnEnablement()` gate (`ts-shared/utils/sentry-deployment-gate.mts`). A
  missing or invalid deployed DSN disables reporting and emits one value-free warning per isolate;
  dev, CI, and test remain silent. This is independent of `PRODUCTION`, which only gates
  HSTS/strict-mode; see [reference-production-mode.md](reference-production-mode.md).
- **Release:** `GIT_COMMIT` is set by the private deployment receiver.
- **Error capture:** only origin fetch failures (502s) via `captureWorkerException()` in the origin `fetch()` catch block. Expected edge responses (geo-blocks=403, rate limits=429, WebSocket errors=400) return via `edgeErrorResponse()` and never throw.
- **Request-metadata scrubbing:** `beforeSend` and `beforeSendSpan` remove
  URL query strings/fragments and redact credential headers and cookies before transmission.
- **Tunnel:** the `POST /monitoring` Sentry tunnel ([`src/sentry-tunnel.mts`](src/sentry-tunnel.mts)) trusts only normalized configured web and Worker DSNs. It returns `403` for a mismatch and `503` when neither configured DSN is valid.
