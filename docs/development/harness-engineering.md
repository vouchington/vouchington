# Harness Engineering — Agent Observability

Harness engineering means building scaffolding around coding agents so they can
iterate without waiting for a human to translate raw logs. For this repo, the
first practical step is to turn local Playwright and `main` CI failures into
queryable observability signals: Sentry for errors, OpenTelemetry for traces and
logs, and MCP access for agent triage.

## Ideal State

The ideal harness is an ephemeral per-worktree observability stack. An agent
starts a sandbox, runs the app and checks, then queries metrics, logs, and traces
through MCP using LogQL/PromQL-style searches and trace search. It iterates until
the acceptance criteria pass and attaches the relevant evidence to the PR.

Staging and production telemetry should both be reachable through read-only MCP
tools. Staging acts as the persistent pre-production source; production is used
for real incidents and regression correlation. Until CloudWatch is exposed
through MCP, agents hunt deployed errors with
[Deployed Error Investigation](../operations/deployed-error-investigation.md).

## Current State

Staging is the preferred observability source once the environment is healthy.
When staging is unavailable, the system falls back to two sources:

| Source           | Signals                                                               | Access pattern                                                      |
| ---------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------- |
| CI on `main`     | Same-run Playwright OTel traces/logs uploaded to S3                   | Object fetch under the `AWS_OTEL_STORE_URI` secret prefix           |
| Local Playwright | OTel traces to Jaeger and raw webServer logs under the temp directory | `./dev/otel-up`, Playwright run, Jaeger at `http://localhost:16686` |

OTel export is deliberately **main-only** for CI. PR branches do not start the
OTel collector, keeping intentional PR failures and forked/untrusted code out of
the exported traces. The CI gate is:

```text
github.event_name == 'push' && github.ref == 'refs/heads/main'
```

## Sentry

Sentry reports only from deployed environments — `ENVIRONMENT=staging` or
`ENVIRONMENT=production` — enforced by a shared fail-closed helper,
`resolveSentryEnablement()` in `ts-shared/utils/sentry-deployment-gate.mts`. Every
init site resolves its own `environment` value and passes it to the helper, which
enables the SDK only when it matches the allowlist; anything else (`test`,
`development`, CI, unset, or an unrecognized value) stays disabled.

The gated sites:

- `backend/modules/on-error/sentry.mts`
- `web/sentry-server-options.ts`
- `web/sentry-edge-options.ts`
- `web/sentry-client-options.ts`
- `lambdas/shared/sentry.mts`
- `cloudflare-worker/src/sentry.mts`

CI, local dev, and test runs never send Sentry events — there is no CI opt-in
mechanism; the former `SENTRY_ENABLE_IN_CI` / `environment:ci-main` reporting path
has been removed entirely. `OTEL_ENABLED=1` still enables the SDK for local OTel
tracing (`otelOnly` mode), but with `dsn: undefined` and a `beforeSend` that drops
every event, so no data reaches Sentry from that mode either.

Intentional errors must not reach Sentry from staging/production. The backend
`onError` path and Sentry `beforeSend` filters drop status `<500`, `ECONNRESET`,
`EPIPE`, expected crawler operational errors, and errors tagged with
`tags.suppressLogging === true`. If a staging/production canary shows intentional
noise, tag that exact error path with `suppressLogging` or model it as a `<500`
expected error instead of adding broad message filters.

Agent query entry points:

```text
environment:staging AND is:unresolved
environment:production AND is:unresolved
environment:staging AND release:<sha>
```

## OpenTelemetry

Local Playwright:

```bash
./dev/otel-up
OTEL_ENABLED=1 OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318 OTEL_LOGS_EXPORTER=otlp pnpm exec playwright test playwright/tests/auth/login.spec.mts
```

When `OTEL_ENABLED=1`, the backend preloads Sentry's OTel instrumentation hook
and the backend, lambda, and Next.js Sentry init paths attach an extra OTLP span
processor. Sentry owns the global provider, preventing double TracerProvider
registration while exporting the same run to the OTel Collector. Cloudflare
Worker/workerd OTel is out of scope.

CI-main OTel runs inside the normal sharded Playwright job. The same main run
starts an OTel Collector, writes collector trace/log files, and captures raw
webServer logs as short-lived GitHub artifacts — Sentry itself stays disabled for
this run, since CI is not in the deployed-environment allowlist. A main-only
follow-up store job, which does not execute PR-controlled Playwright code,
downloads those artifacts and uploads them to:

```text
${AWS_OTEL_STORE_URI}/<sha>/<run-id>-<attempt>/shard-<n>/
```

## MCP

Interactive sessions already enable the Claude Sentry plugin in
`.claude/settings.json`. Headless/CI agents use `.mcp.json`, which declares the
stdio `@sentry/mcp-server`.

Required secret:

- `SENTRY_ACCESS_TOKEN` injected by the environment, never committed
- organization: `SENTRY_ORG` from the environment
- scopes: read-only project/event/issue access sufficient for querying issues
  and events

Sentry DSNs in source are public write keys. They are not the same as the MCP
access token.

## Roadmap

| Phase  | Work                                                                                                                                                                             |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Now    | Staging/production Sentry via the fail-closed deployed-environment gate; local Playwright OTel to Jaeger; same-run main-only Playwright OTel files to S3; Sentry MCP docs/config |
| Next   | Richer trace/log correlation tags and helper scripts for fetching OTel S3 bundles                                                                                                |
| Future | Replace S3 dumps with a hosted OTel backend such as Tempo/Grafana or vendor search, expose CloudWatch metrics through MCP, add replay and richer debug context                   |

The explicit current gap is a hosted queryable OTel backend. Until it exists,
staging/production Sentry and local Playwright OTel are the harness observability
sources; CI-main contributes OTel traces/logs only, never Sentry events.
