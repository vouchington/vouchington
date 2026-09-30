# Batch Lookup Helpers

Source entrypoint: [backend/services/batch-lookup/README.md](../../../../../backend/services/batch-lookup/README.md)

Shared helpers for backend services that accept ordered caller identifiers, query PostgreSQL in
typed partitions, and return rows scattered back into caller order.

Use these helpers when a batch service needs to preserve duplicate inputs and return `null` for
missing rows. Domain SQL stays in the owning service so table and view ownership remains local.

`queryOrderedIdentifierBatch` runs the shared sequence: normalize identifiers, partition them into
ordered input CTEs, execute the caller-supplied statement and row reader, then scatter rows in
caller order with `input_order` removed. Keep each partition `type` and normalizer return on the
caller's identifier union, such as `'id' | 'slug'`.

Related conventions:

- [Services README](../README.md)
- [Services agent rules](../../../../../backend/services/AGENTS.md)
- [API performance requirements](../../../../requirements/platform/api-performance.md)
