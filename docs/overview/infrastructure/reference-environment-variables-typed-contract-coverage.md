# Environment Variables reference

[Back to Environment Variables](environment-variables.md)

## Typed Contract Coverage

The hand-maintained subject leaves remain the reader-facing inventory. The
`config-inventory-policy` static check verifies that every name in the typed env-var contract
appears in at least one canonical `reference-environment-variables-*.md` leaf, not necessarily this
typed-contract-coverage leaf. This leaf records core infrastructure and exact-name coverage for
contract names otherwise covered by wildcard rows, operational tuning notes, or generated local
setup summaries:

- `API_KEY_CHECKSUM_SECRET`
- `IMAGE_LAMBDA_PORT`
- `INSPECTOR_PORT`
- `NEXT_PORT`
- `NEXT_PUBLIC_API_BASE_URL`
- `CF_WORKER_ROUTE`
- `COPYRIGHT_INTAKE_ENABLED`
- `NODE_OPTIONS`
- `QUEUES`
- `RAYON_NUM_THREADS`
- `RUST_TOKIO_MAX_BLOCKING_THREADS`
- `RUST_TOKIO_WORKER_THREADS`
- `S3_BUCKET_SES_INBOUND`
- `S3_BUCKET_COPYRIGHT_EVIDENCE`
- `STRIP_TEST_IDS`
- `UV_THREADPOOL_SIZE`
- `VALKEY_CONTAINER`
- `WORKER_PORT`

## Adding Third-Party Integrations

Before enabling a new third-party browser or backend integration:

- Document every backend secret, runtime-public browser config value, Worker var, and runtime config
  knob in the appropriate subject-specific `reference-environment-variables-*.md` leaf and the
  integration's nearest README. Keep this leaf for its core-infrastructure and contract-coverage role
  rather than treating it as the catch-all integration inventory.
- Do not add new `NEXT_PUBLIC_*` Docker build args for environment-specific browser config. Prefer
  runtime-public config for OAuth client IDs, captcha site keys, analytics IDs, browser push public
  keys, and client-side limits. Keep build args only for values that `next build` truly needs to
  generate output, such as asset/static output settings or build metadata.
- Add browser SDK/API origins to `REGISTERED_WEB_CSP_ORIGINS` and `buildWebCsp()` in
  `cloudflare-worker/src/csp.mts`; tests must prove each registered origin is emitted in the
  required directives and each emitted origin is registered.
- State the fail-open or fail-closed policy in docs and code comments. Security hard gates such as
  Turnstile should fail closed; paid or advisory risk signals such as reCAPTCHA/Web Risk should fail
  open when the provider is unavailable.
- Add tests for missing/blank env values, provider errors/rate limits, and CSP coverage where the
  integration touches the browser.

## Core Infrastructure

| Name                                  | Required | Where           | Notes                                                                                                                                                                                                                                                                                                              |
| ------------------------------------- | -------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `DATABASE_URL`                        | Local/CI | SM              | PostgreSQL connection string; deployed ECS assembles this from DB parts instead                                                                                                                                                                                                                                    |
| `DATABASE_HOST`                       | ECS      | ECS             | Aurora writer endpoint used when `DATABASE_URL` is absent                                                                                                                                                                                                                                                          |
| `DATABASE_NAME`                       | ECS      | ECS             | Aurora database name used when `DATABASE_URL` is absent                                                                                                                                                                                                                                                            |
| `DATABASE_USER`                       | ECS      | ECS             | Aurora username used when `DATABASE_URL` is absent                                                                                                                                                                                                                                                                 |
| `DATABASE_PASSWORD`                   | ECS      | Secrets Manager | Aurora-managed password JSON field                                                                                                                                                                                                                                                                                 |
| `DATABASE_SSLMODE`                    | ECS      | ECS             | PostgreSQL SSL mode; defaults to `require` when assembled                                                                                                                                                                                                                                                          |
| `CF_WORKER_ROUTE`                     | ECS      | ECS             | Cloudflare Worker route used by cache-purge jobs in backend and worker services; local dev writes it into `.env`                                                                                                                                                                                                   |
| `READ_DATABASE_URL`                   | No       | SM              | Read replica connection string                                                                                                                                                                                                                                                                                     |
| `PG_POOL_MAX`                         | No       | ECS             | Connection pool max (default: 20)                                                                                                                                                                                                                                                                                  |
| `PG_READ_POOL_MAX`                    | No       | ECS             | Read-pool connection max; falls back to `PG_POOL_MAX`, then 20                                                                                                                                                                                                                                                     |
| `PG_WRITE_POOL_MAX`                   | No       | ECS             | Write-pool connection max; falls back to `PG_POOL_MAX`, then 20                                                                                                                                                                                                                                                    |
| `PG_ADVISORY_LOCK_POOL_MAX`           | No       | ECS             | Session advisory-lock pool max; defaults to `min(4, PG_WRITE_POOL_MAX)` and may not exceed the write-pool max                                                                                                                                                                                                      |
| `PG_CONNECTION_TIMEOUT_MS`            | No       | ECS             | Pool acquisition and connection timeout in milliseconds (default: 5000)                                                                                                                                                                                                                                            |
| `PG_MIGRATION_LOCK_TIMEOUT_MS`        | No       | ECS             | Migration advisory/schema lock timeout in milliseconds (default: 5000)                                                                                                                                                                                                                                             |
| `PG_MIGRATION_STATEMENT_TIMEOUT_MS`   | No       | ECS             | Per-statement migration timeout in milliseconds (default: 900000)                                                                                                                                                                                                                                                  |
| `PG_MIGRATION_CONNECT_RETRY_ATTEMPTS` | No       | ECS             | Migration-runner connect attempts before giving up on a retryable timeout (default: 6)                                                                                                                                                                                                                             |
| `PG_MIGRATION_CONNECT_RETRY_DELAY_MS` | No       | ECS             | Delay between migration-runner connect retry attempts in milliseconds (default: 5000)                                                                                                                                                                                                                              |
| `PG_QUERY_TIMING_SAMPLE`              | No       | ECS             | Fraction `[0,1]` of psql queries emitted to `pg_query_timing` (default: 1)                                                                                                                                                                                                                                         |
| `EXPLAIN_JIT_MODE`                    | No       | Local/CI        | Diagnostic EXPLAIN JIT mode: `off` (default) or `on`; application pools always use `off`                                                                                                                                                                                                                           |
| `EXPLAIN_PLAN_CACHE_MODE`             | No       | Local/CI        | EXPLAIN prepared-plan mode: `auto`, forced custom/generic, or `compare` (both forced modes)                                                                                                                                                                                                                        |
| `PG_POOL_STATS_INTERVAL_MS`           | No       | ECS             | Per-process pool-gauge sample interval ms (default: 60000)                                                                                                                                                                                                                                                         |
| `VALKEY_URL`                          | No       | SM              | Default Valkey URL (fallback for all groups)                                                                                                                                                                                                                                                                       |
| `VALKEY_SESSION_URL`                  | No       | SM              | Session storage Valkey URL                                                                                                                                                                                                                                                                                         |
| `VALKEY_CACHE_URL`                    | No       | SM              | Cache Valkey URL                                                                                                                                                                                                                                                                                                   |
| `VALKEY_RATE_LIMITER_URL`             | No       | SM              | Rate limiter Valkey URL                                                                                                                                                                                                                                                                                            |
| `VALKEY_DYNAMIC_CONFIG_URL`           | No       | SM              | Dynamic config Valkey URL                                                                                                                                                                                                                                                                                          |
| `VALKEY_WORKER_QUEUE_URL`             | No       | SM              | GlideMQ worker queue Valkey URL                                                                                                                                                                                                                                                                                    |
| `PORT`                                | No       | ECS             | Server port (default: 3000)                                                                                                                                                                                                                                                                                        |
| `NODE_ENV`                            | No       | ECS             | Set by ECS to mirror `ENVIRONMENT` (`staging` \| `production`) on backend/worker and the image-resize Lambda; hardcoded `production` on web since Next's standalone `server.js` always forces it there regardless (see `vouchington-infra/opentofu/ecs-web.tf`). `ENVIRONMENT` remains the deploy-target authority |
| `ENVIRONMENT`                         | Yes      | ECS             | Deployment environment name used by ECS and Lambda config assembly                                                                                                                                                                                                                                                 |
| `GIT_COMMIT`                          | Yes      | Build           | Git revision used to tag backend runtime Sentry events                                                                                                                                                                                                                                                             |
