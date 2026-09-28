# Analytics data store

- Use typed `@services/analytics` wrappers; call `emit()` directly only when defining wrappers or data-store integrations.
- Preserve module-load graceful-shutdown registration and the shared local-retention job.
- Modes, paths, and examples belong in [README.md](../../../docs/overview/architecture/backend/data-stores/analytics/README.md); architecture and environment variables belong in [the analytics pipeline](../../../docs/overview/architecture/analytics-pipeline.md).
