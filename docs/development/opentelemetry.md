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

Playwright preloads the Node auto-instrumentation hook for the backend and lambda
dev server, while the standalone web server uses `web/instrumentation.ts`.
Cloudflare Worker/workerd OTel is not wired in this phase.

### 4. Stop the stack

```bash
./dev/otel-down
```

### Disabling OTel

Unset `OTEL_ENABLED` (or remove it from `~/voucha.env`) and restart `./dev/tmux`.
All instrumentation is a complete no-op when the variable is unset.

## Sentry coexistence

`@sentry/node` v10 registers its own global OTel TracerProvider internally. The
Playwright harness uses Sentry's preload/init path and adds an extra OTLP span
processor so one provider can export both to Sentry and to the OTel Collector.
Do not combine that path with the generic
`@opentelemetry/auto-instrumentations-node/register` preload in the same process.

When `OTEL_ENABLED=1`:

- Playwright backend/web/lambda servers use Sentry-owned OTel, but Sentry itself
  stays disabled unless `ENVIRONMENT` is `staging` or `production` — never true in
  CI — so these runs send traces only, never Sentry errors.
- `dev/tmux` still uses the generic auto-instrumentation preload for local
  service development; backend Sentry detects that preload and skips `Sentry.init`
  to avoid double TracerProvider registration.
- Sentry in deployed environments is unaffected (`OTEL_ENABLED` is never set in
  deploy env).

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
