# Transactions

[Back to PostgreSQL Data Store](README.md#contents)

Newly owned transaction scopes use an explicit `await using` resource from `@vouchington/postgres`
(see [transactions.mts](../../../backend/data-stores/psql/transactions.mts)): it rolls back unless
`commit()` succeeds, and post-commit actions run only after that commit. `withTransactionOptions`
is only for joining a client already inside a transaction, because a nested scope must not own the
outer commit or rollback.

## Nested clients and transaction probes

Joining versus opening a transaction on a **borrowed** client needs a live backend probe
(`SAVEPOINT` / `RELEASE SAVEPOINT`), because the caller's state is not knowable statically. Owned
transactions acquire their own idle connection and need no probe. `25P01`
(`no_active_sql_transaction`) means the client is idle; any other error, including `25P02`, is
rethrown. Use raw `client.query` for the probe so the expected `25P01` is not recorded as a query
error in `pg_query_timing`.

## Why `getTransactionStatus()` is not a replacement

node-postgres rejects the query promise on `ErrorResponse`, before `ReadyForQuery` updates its
status. A callback reading the getter immediately sees stale `T`, and a promise `catch` is
packet-boundary racy: it sees `E` only if both packets parsed in the same turn. Upstream's own
tests run a follow-up `SELECT 1` before asserting `E`. Do not replace the SAVEPOINT probes with the
getter until upstream documents and tests a safe immediate `E`, and do not patch `pg`.
