# Analytics Pipeline

Local-first analytics: application code emits typed events, a backend selected at call time
(disabled, local JSONL, or Firehose to S3 Tables) buffers and writes them, and local files are
queried with DuckDB. Only the local backend is queryable through `query()`.

Read `backend/data-stores/analytics/` for the emit, backend and shutdown code and
`backend/services/analytics/` for the typed emit wrappers. Both flush buffers on graceful shutdown.
Scheduled PostgreSQL maintenance must start from captured telemetry, not source-code guessing; when
the operational tables are absent or empty there is no actionable signal and the run stops.

## MCP tool calls

One HTTP request can carry several MCP messages, so the request-level usage row cannot name the tool,
the merged-tool option, or how that call settled. Per-call analytics records those closed dimensions
so tool consolidation and description work can be measured. A notification-shaped `tools/call` is not
a call the server runs, so it is absent. The audit log stays the security record; this stream is the
product record of the same settled outcome, without arguments, results, or free text.
