# OpenTelemetry — Local Tracing

Distributed tracing for local development, designed to mirror the AWS deploy path with no app-code
changes at deploy time. For the agent-observability roadmap that uses local Playwright plus opt-in
CI diagnostic output, see [Harness Engineering](harness-engineering.md).

## Architecture

Apps emit vendor-neutral **OTLP** to an OTel Collector. Locally, the collector fans traces out to a
Jaeger all-in-one UI. On AWS, swap the same collector for ADOT (an ECS sidecar) with an `awsxray`
exporter and point `OTEL_EXPORTER_OTLP_ENDPOINT` at it; instrumentation is unchanged. Deployed logs
today are CloudWatch, not X-Ray; use
[Deployed Error Investigation](../operations/deployed-error-investigation.md).

## Runbook

1. `./dev/otel-up` starts the collector and Jaeger (UI at http://localhost:16686).
2. Export `OTEL_ENABLED=1`, `OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318`,
   `OTEL_EXPORTER_OTLP_PROTOCOL=http/protobuf`, `OTEL_LOGS_EXPORTER=otlp`, and
   `OTEL_TRACES_SAMPLER=parentbased_always_on` (or put them in `~/voucha.env`), then restart
   `./dev/tmux`. Its banner prints "OpenTelemetry: ENABLED".
3. A web-to-API request should show as one connected trace if W3C trace-context propagation works.
4. `./dev/otel-down` stops the stack. Unsetting `OTEL_ENABLED` makes all instrumentation a no-op.

Playwright preloads `dev/otel-register.mts` into the backend, lambda dev server, and standalone web
server when `OTEL_ENABLED=1`. Cloudflare Worker/workerd OTel is not wired.

## Sentry coexistence

`dev/otel-register.mts` (the `@opentelemetry/auto-instrumentations-node/register` hook) is the only
owner of the OTel TracerProvider and OTLP export. Sentry SDK v11 reports its spans natively, so it
registers no provider and adds no OTLP span processor.

- Sentry stays disabled unless `ENVIRONMENT` is `staging` or `production`, so local and CI runs
  send traces to the collector only, never Sentry errors.
- The web server sets `enableOpenTelemetrySetup: false` so `@sentry/nextjs` does not compete with
  the hook for the global provider.
- `OTEL_ENABLED` is never set in deployed environments, so deployed Sentry is unaffected.
- Spans created with `Sentry.startSpan*` are not exported over OTLP.
