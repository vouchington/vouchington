# Analytics Pipeline

Local-first analytics pipeline. Events are emitted from application code and stored as JSONL files locally, then queried with DuckDB. In production (Phase 3), a Kinesis Data Firehose backend lands events as Parquet into S3 Tables (Iceberg).

## Contents

- <a id="code-entry-points"></a>[Code entry points](reference-analytics-pipeline-code-entry-points.md)
- <a id="backends"></a>[Backends](reference-analytics-pipeline-code-entry-points.md#backends)
- <a id="pipeline-flow"></a>[Pipeline Flow](reference-analytics-pipeline-code-entry-points.md#pipeline-flow)
- <a id="environment-variables"></a>[Environment variables](reference-analytics-pipeline-environment-variables.md)
- <a id="table-registry"></a>[Table registry](reference-analytics-pipeline-table-registry.md)
- <a id="retention"></a>[Retention](reference-analytics-pipeline-retention.md)
- <a id="querying-with-duckdb"></a>[Querying with DuckDB](reference-analytics-pipeline-retention.md#querying-with-duckdb)
- <a id="graceful-shutdown"></a>[Graceful shutdown](reference-analytics-pipeline-retention.md#graceful-shutdown)
- <a id="firehose--s3-tables"></a>[Firehose + S3 Tables](reference-analytics-pipeline-retention.md#firehose--s3-tables)
- <a id="related"></a>[Related](reference-analytics-pipeline-retention.md#related)
