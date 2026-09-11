# Cursors

[Back to PostgreSQL Data Store](README.md#cursors)

[cursors.mts](cursors.mts) wraps `pg-cursor` for large reads that should not materialize the full
result set in memory.

Use it when:

- iterating large backfills
- processing analytics or maintenance jobs
- chunking batch work without `LIMIT/OFFSET`
