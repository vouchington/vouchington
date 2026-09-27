# @services/analytics

Typed emit wrappers for the analytics data store. Each module provides domain-specific helper
functions that call `emit()` from `@data-stores/analytics`. Full module table: [README.md](README.md).
See also: [../../../docs/overview/architecture/analytics-pipeline.md](../../../docs/overview/architecture/analytics-pipeline.md).

## Rule

Call the typed wrappers documented in [README.md](README.md) instead of constructing analytics
records directly. Add new schemas at the data-store boundary and expose domain-specific arguments
through this package.

## See Also

- Parent services: [../AGENTS.md](../AGENTS.md)
- Data store: [../../data-stores/analytics/AGENTS.md](../../data-stores/analytics/AGENTS.md)
- Analytics pipeline: [../../../docs/overview/architecture/analytics-pipeline.md](../../../docs/overview/architecture/analytics-pipeline.md)

## Relocated reference navigation

- [domain wrappers](../../../docs/overview/architecture/services/analytics/README.md)
