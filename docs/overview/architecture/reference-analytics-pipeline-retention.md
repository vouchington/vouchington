# Analytics Pipeline reference

[Back to Analytics Pipeline](analytics-pipeline.md)

## Retention

Applies to local JSONL files and is enforced by the existing daily `dataRetentionCleanup` job when the local backend is enabled:

| Tables                                                                                                                                                          | Retention |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| `web_page_view` (non-landing-page)                                                                                                                              | 30 days   |
| `queue_jobs`, `queue_workers`, `rss_feed_processing`, `valkey_cache_calls`, `ai_calls`, `crawler_requests`, `pg_query_timing`, `pg_pool_stats`, `pg_vote_drift` | 90 days   |
| `web_page_view` (landing-page), `web_click`, `auth_sessions`                                                                                                    | 1 year    |

## Querying with DuckDB

All event files for a table live under `./tmp/analytics/<table>/`. Each file covers one day.

```bash
# Count events per page kind
duckdb -c "SELECT page_kind, COUNT(*) AS n FROM read_ndjson('./tmp/analytics/web_page_view/*.jsonl', ignore_errors=true) GROUP BY 1 ORDER BY n DESC"

# Queue throughput last 7 days
duckdb -c "SELECT DATE_TRUNC('day', event_time::TIMESTAMP) AS day, COUNT(*) AS completed FROM read_ndjson('./tmp/analytics/queue_jobs/*.jsonl', ignore_errors=true) WHERE event = 'completed' GROUP BY 1 ORDER BY 1"
```

### PostgreSQL operational triage

Scheduled PostgreSQL maintenance must start from captured telemetry, not source-code guessing. If
the PostgreSQL operational analytics tables are absent or empty, the run has no actionable signal and
should stop with that finding.

Use these DuckDB probes when the local analytics directory contains captured PostgreSQL telemetry:

```bash
# Pool saturation by process pool, including the dedicated session advisory-lock pool
duckdb -c "SELECT event_time, pool, total, idle, waiting, max FROM read_ndjson('./tmp/analytics/pg_pool_stats/*.jsonl', ignore_errors=true) WHERE waiting > 0 ORDER BY event_time DESC LIMIT 50"

# Per-query latency outliers by required /* functionName */ annotation
duckdb -c "SELECT annotation, pool, duration_ms, row_count, error, event_time FROM read_ndjson('./tmp/analytics/pg_query_timing/*.jsonl', ignore_errors=true) ORDER BY duration_ms DESC LIMIT 50"

# Vote counter drift
duckdb -c "SELECT entity_table, sampled, drifted, sample_entity_id, event_time FROM read_ndjson('./tmp/analytics/pg_vote_drift/*.jsonl', ignore_errors=true) WHERE drifted > 0 ORDER BY event_time DESC LIMIT 50"
```

From application code:

```typescript
import { query } from '@data-stores/analytics'

const rows = await query(`
  SELECT SUM(hits) AS hits, SUM(misses) AS misses
  FROM valkey_cache_calls
  WHERE event_time >= TIMESTAMP '2025-01-01'
`)
```

`query()` returns `[]` when `ANALYTICS_BACKEND !== 'local'`.

## Graceful shutdown

Both the local and firehose backends buffer records in memory (≤500 records / 1 s / 4 MB) and flush
on shutdown. [backend/data-stores/analytics/graceful-shutdown.mts](../../../backend/data-stores/analytics/graceful-shutdown.mts) self-registers its
`onGracefulShutdown` callback with `addGracefulShutdownCallback()` at module load — but only once
that file is actually loaded. The package's root export (`@data-stores/analytics` → `index.mts`)
re-exports `onGracefulShutdown`, so a process gets the flush automatically as soon as anything in
its dependency graph imports the root specifier. Subpath imports resolve straight to their target
file instead and do **not** pull in `graceful-shutdown.mts` on their own — e.g.
[backend/services/analytics/queue.mts](../../../backend/services/analytics/queue.mts) imports `@data-stores/analytics/queue` directly, which loads
`queue.mts` without ever loading `index.mts`. A process needs at least one root-specifier import
somewhere in its graph for the shutdown flush to register; callers otherwise do not need to
register the callback themselves.

## Firehose + S3 Tables

The `firehose` backend buffers in process (≤500 records / 1 s / 4 MB) and sends `PutRecordBatch` calls to streams named `${ANALYTICS_FIREHOSE_PREFIX}${table}`. `vouchington-infra` OpenTofu provisions one stream per analytics table, landing records in S3 Tables (Iceberg) with failed delivery payloads retained briefly in an encrypted S3 error bucket. The account-level `s3tablescatalog` Glue federated catalog is owned by the global infrastructure stack (`opentofu/global` in the private `vouchington-infra` repository); Firehose uses each environment's table-bucket child catalog beneath it. OpenTofu also grants the Firehose delivery role Lake Formation database/table permissions and `lakeformation:GetDataAccess` so Firehose can resolve the S3 Tables Glue metadata during stream creation and delivery.

`query()` is still local-only. Remote Iceberg querying is a separate follow-up before production dashboards should rely on `ANALYTICS_BACKEND=firehose`.

## Related

- [Graceful shutdown](graceful-shutdown.md) — process shutdown pattern and callback registration
- [Environment variables](../infrastructure/environment-variables.md) — full env var reference by category
- [Infrastructure](../infrastructure/infrastructure.md) — AWS resources, data stores, observability overview
- [Backend rules](../../../backend/CLAUDE.md) — workspace service and data conventions
- Data store agent conventions: [backend/data-stores/analytics/CLAUDE.md](../../../backend/data-stores/analytics/CLAUDE.md)
- Emit wrapper conventions: [backend/services/analytics/CLAUDE.md](../../../backend/services/analytics/CLAUDE.md)
