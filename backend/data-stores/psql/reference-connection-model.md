# Connection Model

[Back to PostgreSQL Data Store](README.md#connection-model)

[setup.mts](setup.mts) delegates pool construction to `createPsql()` from
`@vouchington/postgres`, which provides three `pg` pools:

- `writePool` — primary database writes and transaction clients
- `readPool` — read-only traffic when replica-safe
- `advisoryLockPool` — dedicated primary connections for session advisory locks whose protected
  work may need ordinary write clients; isolating them prevents lock holders from saturating
  `writePool` and lets unrelated lock keys progress concurrently

The shared runtime routes each pool's idle-client `error` event to this adapter's `onError`
handler. PostgreSQL can close an idle connection during auto-pause or failover; the pool discards
that client and can open another. A query using a terminated connection instead rejects its query
promise. An idle-client event alone does not mean that a concurrent schema read failed.

Pool configuration includes:

- `statement_timeout = 30s` (production/dev). In tests `getPsqlPoolConfiguration()` sets this to
  `0` (unbounded) instead, since fixtures are legitimately slow — but `0` is falsy, so `pg`
  (`pg/lib/client.js`) omits `statement_timeout` from the startup packet entirely rather than
  sending `0`, and every test session falls through to the database's own default. A
  `boundStatementTimeoutForTestDatabase()` `ALTER DATABASE … SET statement_timeout` in
  `vitest.setup.data-stores.mts`, run once in `globalSetup` before workers fork, uses exactly that
  fallthrough to bind test sessions to `TEST_STATEMENT_TIMEOUT_MS`
  (`backend/test-helpers/statement-timeout.mts`, default 20s, below the 30s `testTimeout`) with no
  `@vouchington/postgres` change. A stuck test statement now fails as an attributable `57014`
  instead of an opaque vitest timeout — see the adjacent stderr-attribution note in
  [query-telemetry.mts](query-telemetry.mts) and the guard test at
  [`__tests__/statement-timeout.test.mts`](__tests__/statement-timeout.test.mts). Migrations,
  `beginBoundedTransaction`, and the advisory-lock helpers all set their own session/transaction-local
  `statement_timeout` and are unaffected by this database-level default.
- `idle_in_transaction_session_timeout = 10s`
- separate production read/write sizing via `PG_READ_POOL_MAX` and `PG_WRITE_POOL_MAX`, with
  `PG_POOL_MAX` as the compatibility fallback
- advisory-lock sizing via `PG_ADVISORY_LOCK_POOL_MAX`; its default is the smaller of four and the
  configured write-pool maximum, and an explicit override may not exceed that write-pool ceiling
- connection acquisition and establishment timeout via `PG_CONNECTION_TIMEOUT_MS`
- test pools keep the same default size as production (`PG_TEST_POOL_MAX`, default 20) but evict
  idle clients after 100ms

All three pools participate in PostgreSQL graceful shutdown. Pool maxima are capacity ceilings, not
eager reservations: connections open lazily. The per-process worst-case connection budget is
`readMax + writeMax + advisoryLockMax`, while idle pools may hold far fewer connections.

CI GitHub Actions postgres services set `max_connections=300` through `POSTGRES_INITDB_ARGS`. The
default image value is 100, which cannot hold the Vitest fork budget: `(VITEST_MAX_WORKERS + 1
globalSetup process) * (readMax + writeMax + advisoryLockMax)` plus PostgreSQL's reserved
superuser slots. Backend CI workflows explicitly use three workers, so their normal budget is
`(3 + 1) * (20 + 20 + 4) + 3 = 179`; the repository fallback is two workers. CI caps
`VITEST_MAX_WORKERS` at 5, making the supported maximum
`(5 + 1) * (20 + 20 + 4) + 3 = 267`. Exceeding the server cap fails tests with
`FATAL 53300 sorry, too many clients already`. The
[`postgres-image-policy` test](../../../.github/workflows/postgres-image-policy.test.mts) keeps the
service and initialize-smoke docker paths on that ceiling.

```mermaid
flowchart LR
  workers["Vitest forks + globalSetup"] --> pools["read + write + advisory maxima"]
  pools --> postgres["CI postgres max_connections"]
```

Do not set `pipeline` on `getPsqlPoolConfiguration()` or the shared pool constructors. pg 8.23
pipelining is a same-client submit, and this package enables it only inside `psql.pipelineBatch()`
by toggling the flag on a checked-out client, then restoring it before release. Pool-wide
pipelining would also apply to transactions, cursors, and COPY.
