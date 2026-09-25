# OpenTelemetry — Local Tracing

Distributed tracing for local development, designed to mirror the AWS deploy path with
no app-code changes at deploy time. For the agent-observability roadmap that uses
local Playwright plus CI-main OTel output, see [Harness Engineering](harness-engineering.md).

## Architecture

Apps emit vendor-neutral **OTLP** to an OTel Collector. Locally, the collector fans
traces out to a Jaeger all-in-one UI. On AWS, you swap the same collector image for
**ADOT** and point it at X-Ray — the instrumentation is unchanged.

```
voucha-api  ─┐
worker-cpu  ─┼──────────────────▶ OTel Collector ──▶ Jaeger UI :16686 [LOCAL]
voucha-web  ─┘                    OTLP/HTTP :4318
```

## Setup (local)

### 1. Start the collector + Jaeger stack

```bash
./dev/otel-up
```

This starts two Docker containers:

- `otel/opentelemetry-collector-contrib` — receives OTLP on ports 4317 (gRPC) and 4318 (HTTP)
- `jaegertracing/all-in-one` — stores and displays traces at **http://localhost:16686**

### 2. Enable OTel in your shell and restart services

```bash
export OTEL_ENABLED=1
export OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
export OTEL_EXPORTER_OTLP_PROTOCOL=http/protobuf
export OTEL_LOGS_EXPORTER=otlp
export OTEL_TRACES_SAMPLER=parentbased_always_on
./dev/tmux
```

Or add these to `~/voucha.env` to persist them across shell sessions.

> **Tip:** `./dev/tmux` prints "OpenTelemetry: ENABLED" in its banner so you can
> confirm the flag was picked up before attaching.

### 3. View traces

Open **http://localhost:16686**. After exercising the app through the CF Worker
(`https://localhost:$WORKER_PORT`), you should see services:

- `voucha-web` — Next.js server
- `voucha-api` — backend API (express, pg, undici spans)
- `voucha-worker-cpu` — the local job queue worker

A web→API request will show a single connected trace if W3C trace-context propagation
is working end-to-end.

For local Playwright, start the collector and run:

```bash
OTEL_ENABLED=1 OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318 OTEL_LOGS_EXPORTER=otlp pnpm exec playwright test playwright/tests/auth/login.spec.mts
```

Playwright preloads `dev/otel-register.mts` (the Node auto-instrumentation hook) into
the backend, lambda dev server, and standalone web server. Cloudflare Worker/workerd
OTel is not wired in this phase.

### 4. Stop the stack

```bash
./dev/otel-down
```

### Disabling OTel

Unset `OTEL_ENABLED` (or remove it from `~/voucha.env`) and restart `./dev/tmux`.
All instrumentation is a complete no-op when the variable is unset.

## Sentry coexistence

`dev/otel-register.mts` (the generic
`@opentelemetry/auto-instrumentations-node/register` hook) is the only owner of the
OTel TracerProvider and OTLP export. Sentry SDK v11 reports its spans natively, so
Sentry no longer registers a provider, adds an OTLP span processor, or preloads
itself: `dev/tmux` and the Playwright harness load the same hook into the backend,
worker, lambda, and web processes when `OTEL_ENABLED=1`.

When `OTEL_ENABLED=1`:

- Sentry itself stays disabled unless `ENVIRONMENT` is `staging` or `production` —
  never true in CI — so local and Playwright runs send traces to the collector only,
  never Sentry errors.
- The web server sets `enableOpenTelemetrySetup: false` (`@sentry/nextjs` otherwise
  registers its own global provider by default) so it does not compete with the
  preloaded hook for the global provider.
- Sentry in deployed environments is unaffected (`OTEL_ENABLED` is never set in
  deploy env).

Sentry spans reach the collector only through the hook's own instrumentation; Sentry
spans created with `Sentry.startSpan*` are not exported over OTLP.

## AWS deploy path (future)

Deployed logs today are CloudWatch, not X-Ray. Use
[Deployed Error Investigation](../operations/deployed-error-investigation.md)
until ADOT is wired.

When you're ready to deploy, the only change is the collector:

1. Replace the local `docker compose` stack with the
   [ADOT Collector as an ECS sidecar](https://aws-otel.github.io/docs/getting-started/collector).
2. Swap the exporter block in `dev/otel/collector-config.yaml` (the commented `awsxray`
   block is already there):

```yaml
exporters:
  awsxray:
    region: us-west-2
    # IAM: ECS task role needs xray:PutTraceSegments + xray:PutTelemetryRecords.

service:
  pipelines:
    traces:
      exporters: [awsxray]
```

3. Set `OTEL_EXPORTER_OTLP_ENDPOINT` in ECS task env to the ADOT sidecar endpoint
   (e.g. `http://localhost:4318` if using host networking on the task).

App instrumentation code is **unchanged** between local and AWS.

## Files

| File                                  | Purpose                                                                                                                      |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `dev/otel/compose.yaml`               | Docker Compose: collector + Jaeger                                                                                           |
| `dev/otel/collector-config.yaml`      | Collector pipeline (local→Jaeger; AWS swap commented)                                                                        |
| `dev/otel/collector-config-ci.yaml`   | Collector pipeline for main CI Playwright OTel output files uploaded to S3                                                   |
| `dev/otel-up`                         | Start the local stack                                                                                                        |
| `dev/otel-down`                       | Stop the local stack                                                                                                         |
| `web/instrumentation.ts`              | Next.js `register()` hook — loads the Sentry server config; Sentry owns the provider and can export an extra OTLP stream     |
| `backend/modules/on-error/sentry.mts` | Sentry init with an extra OTLP span processor when `OTEL_ENABLED=1`                                                          |
| Root `package.json` (devDependencies) | `@opentelemetry/api` + `@opentelemetry/auto-instrumentations-node` (resolved via pnpm hoist from `dev/tmux` node invocation) |
| `dev/tmux`                            | Injects `--import` hook + `OTEL_SERVICE_NAME` per service when `OTEL_ENABLED`                                                |
