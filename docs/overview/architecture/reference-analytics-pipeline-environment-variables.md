# Analytics Pipeline reference

[Back to Analytics Pipeline](analytics-pipeline.md)

## Environment variables

| Variable                    | Default                   | Purpose                                |
| --------------------------- | ------------------------- | -------------------------------------- |
| `ANALYTICS_BACKEND`         | `disabled`                | Backend selection                      |
| `ANALYTICS_LOCAL_DIR`       | `./tmp/analytics`         | JSONL root directory (local backend)   |
| `ANALYTICS_FIREHOSE_PREFIX` | `voucha-analytics-{env}-` | Firehose stream name prefix            |
| `PG_QUERY_TIMING_SAMPLE`    | `1`                       | Fraction `[0,1]` of psql queries timed |
| `PG_POOL_STATS_INTERVAL_MS` | `60000`                   | Per-process pool-gauge sample interval |
