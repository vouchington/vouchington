# Exports

[Back to PostgreSQL Data Store](README.md#exports)

- `read(input, values?, options?)` — run a query against the read pool by default
- `write(input, values?, options?)` — run a query against the write pool
- `query(input, valuesOrOptions?, options?)` — shared entry point used by `read` and `write`
- `psql.pipelineBatch(queries, { readOnly }?)` — pipeline up to 16 ordinary independent queries on
  one checked-out pool client; defaults to the read pool. See
  [Query Helpers](reference-query-helpers.md#pipelined-batches).
- `beginTransaction(options?)` / `beginBoundedTransaction(options)` — acquire an explicitly owned
  transaction for `await using`; `beginTransaction({ client })` selects a pool or borrowed idle
  client, and `commit()` completes the work
- `withTransactionOptions(options, async query => ...)` — join a client already inside a
  transaction; owned work uses an explicit resource instead
- `isUniqueViolation(error)` — type guard for a PostgreSQL `unique_violation` (SQLSTATE `23505`)
  caught from `read`/`write`/a transaction; services use it instead of re-deriving the code check
- `createAsyncGeneratorFromCursor(...)` / `executeHandlerWithCursorInBatches(...)` — stream large
  result sets with `pg-cursor`
- `enableQueryCapture()` / `getCapturedQueries()` / `explainAnalyze()` — capture and replay SQL
  for plan analysis
- `runMigrations()` — apply SQL migrations, views, and idempotent schema operations through the
  migration runner exports

The package barrel is [index.mts](index.mts).
