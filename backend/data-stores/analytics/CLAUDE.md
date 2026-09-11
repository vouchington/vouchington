# Analytics Data Store

Local-first analytics store. Emits structured JSONL records queryable with DuckDB.
Architecture and environment variables: [../../../docs/overview/architecture/analytics-pipeline.md](../../../docs/overview/architecture/analytics-pipeline.md).

## Rules

- Prefer typed wrappers from `@services/analytics`; call `emit()` directly only when defining a new
  wrapper or data-store integration.
- Preserve module-load graceful-shutdown registration and the shared local-retention job.
- Keep runtime modes, paths, and usage examples in [README.md](README.md).

## See Also

- Typed emit wrappers: [`../../services/analytics/`](../../services/analytics/)
- Graceful shutdown: [../../../docs/overview/architecture/graceful-shutdown.md](../../../docs/overview/architecture/graceful-shutdown.md)
- Analytics pipeline: [../../../docs/overview/architecture/analytics-pipeline.md](../../../docs/overview/architecture/analytics-pipeline.md)
- Backend context: [../../CLAUDE.md](../../CLAUDE.md)
