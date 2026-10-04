# Cursors

[Back to PostgreSQL Data Store](README.md#cursors)

[bounded-cursor-api.mts](../../../backend/data-stores/psql/bounded-cursor-api.mts) wraps `pg-cursor` for large reads that should not materialize the full
result set in memory.

Use it when:

- iterating large backfills
- processing analytics or maintenance jobs
- chunking batch work without `LIMIT/OFFSET`

Cursor batch size bounds memory. Scheduled callers also provide a registered DynamicConfig
`maxRows` budget, which adds an outer SQL `LIMIT` with one lookahead row and returns
`{ rowsRead, hasMore, lastRow }`. `rowsRead` counts delivered rows, excluding lookahead.
Breaking early closes the cursor; handler completion is acknowledged only after the final
batch succeeds. Complete user-requested account exports may omit the work budget and retain the underlying
generator fetch default. Handler callers supply a configured batch size.

A cap needs a resume strategy. Mutation-backed selectors can query pending state again.
Enqueue-only selectors retain a fixed sweep cutoff and a stable keyset position in queue
continuations; they must not restart at the same prefix on every scheduled run. A lost queue
continuation is recoverable through the next scheduled sweep. Reconciliation checkpoints
advance only when the entire fixed window drains.
