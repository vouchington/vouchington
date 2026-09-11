# Batch Lookup Helpers

Shared helpers for backend services that accept ordered caller identifiers, query PostgreSQL in
typed partitions, and return rows scattered back into caller order.

Use these helpers when a batch service needs to preserve duplicate inputs and return `null` for
missing rows. Domain SQL and row shaping stay in the owning service so table/view ownership remains
local.

Related conventions:

- [Services README](../README.md)
- [Services agent rules](../CLAUDE.md)
- [API performance requirements](../../../docs/requirements/platform/api-performance.md)
