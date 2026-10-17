# Harness Engineering — Agent Observability

Harness engineering means building scaffolding around coding agents so they can iterate without a
human translating raw logs. The goal is queryable observability signals: Sentry for errors,
OpenTelemetry for traces and logs, and MCP access for agent triage. Until CloudWatch is exposed
through MCP, agents hunt deployed errors with
[Deployed Error Investigation](../operations/deployed-error-investigation.md). The explicit gap is a
hosted queryable OTel backend.

## Sentry

Sentry reports only from deployed environments (`ENVIRONMENT=staging` or `production`), enforced by
the shared fail-closed helper `resolveSentryEnablement()` in
`ts-shared/utils/sentry-deployment-gate.mts`. Every init site passes its own `environment` to it;
anything else (`test`, `development`, CI, unset, unrecognized) stays disabled. CI, local dev, and test
runs never send Sentry events, and `OTEL_ENABLED=1` does not enable Sentry.

Intentional errors must not reach Sentry from staging or production. The backend `onError` path and
the `beforeSend` filters drop status `<500`, `ECONNRESET`, `EPIPE`, expected crawler errors, and
errors tagged `tags.suppressLogging === true`. If a canary shows intentional noise, tag that exact
error path or model it as an expected `<500` instead of adding broad message filters.

## OpenTelemetry

Local tracing is owned by the generic `dev/otel-register.mts` hook loaded when `OTEL_ENABLED=1`; it
owns the global TracerProvider and OTLP export, and the Sentry SDK registers no provider. Manual
Playwright CI diagnostics can upload OTel output as short-lived debug artifacts. Cloudflare
Worker/workerd OTel is out of scope.

## MCP

No repository file registers a Sentry or other MCP server; vouchington-machines registers Sentry per
machine in every harness, and a headless session has it only when its host's user configuration
does. The Sentry access token and organization come from the environment, never a committed file,
with read-only issue and event scopes. Sentry DSNs in source are public write keys, not that token.
