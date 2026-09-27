# When To Read Which File

[Back to PostgreSQL Data Store](README.md#when-to-read-which-file)

- Read [AGENTS.md](../../../backend/data-stores/psql/AGENTS.md) for agent rules when changing migrations, queries, and schema
  callsites
- Read [README.md](README.md) for package structure, runtime behavior, and schema conventions
- Read [reference-transactions.md](reference-transactions.md) for explicit transaction resources,
  nested-client SAVEPOINT probes, and why `getTransactionStatus()` is not a replacement
- Read [types.mts](../../../backend/data-stores/psql/types.mts) for the helper interfaces used by services
- Read the `@vouchington/postgres` package tests for delegated query, transaction, cursor, pool, and
  connection-string behavior
- Read [query-capture.test.mts](../../../backend/data-stores/psql/query-capture.test.mts),
  [explain-analyze.test.mts](../../../backend/data-stores/psql/explain-analyze.test.mts), and
  [transaction-status.test.mts](../../../backend/data-stores/psql/transaction-status.test.mts) for Vouchington-owned adapter boundaries
