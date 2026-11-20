# Analytics data store

- Call `emit()` directly only when defining `@services/analytics` wrappers or data-store integrations.
- Preserve module-load graceful-shutdown registration and the shared local-retention job.
