# Connection Model

[Back to PostgreSQL Data Store](README.md#contents)

[setup.mts](../../../backend/data-stores/psql/setup.mts) builds three `pg` pools through
`@vouchington/postgres`. Sizes and timeouts are configuration; the reasons are below.

- `writePool` takes primary writes and transaction clients; `readPool` takes replica-safe reads.
- `advisoryLockPool` is a dedicated set of primary connections for session advisory locks whose
  protected work may need ordinary write clients. Isolating them keeps lock holders from saturating
  `writePool` and lets unrelated lock keys progress concurrently (see the
  [session advisory lock protocol](../../overview/architecture/services/session-advisory-lock/README.md)).
- Idle-client `error` events are routed to the adapter's `onError`. PostgreSQL can close an idle
  connection during auto-pause or failover; the pool discards it, and an idle-client event alone
  does not mean a concurrent query failed.
- `pg-pool` reports a connection timeout and a queued-checkout timeout with different messages; the
  `psql` and `memberships` workers treat both as bounded job deferrals. The second can also mean
  pool saturation, so it does not by itself identify an Aurora resume.
- Pool maxima are capacity ceilings; connections open lazily. The per-process worst case is
  `readMax + writeMax + advisoryLockMax`.

## CI connection budget

Test forks each hold the full pool budget, so
`(VITEST_MAX_WORKERS + 1 globalSetup) * (readMax + writeMax + advisoryLockMax)` plus reserved
superuser slots must fit the CI Postgres `max_connections`. The image default cannot hold it,
so CI services raise it, and exceeding it fails tests with `FATAL 53300`. The
[`postgres-image-policy` test](../../../.github/workflows/postgres-image-policy.test.mts) keeps the
docker paths on that ceiling. CI also sets `log_min_messages=log`: tests raise `ERROR`s on purpose
and the client already receives each one, so the server copy only flooded the service log, while
startup, checkpoint, crash, `FATAL`, and `PANIC` lines still print.

## Pipelining

Do not set `pipeline` on the shared pool configuration. pg pipelining is a same-client submit and
would also apply to every later transaction statement, cursor, and COPY. `@vouchington/postgres`
enables it only for `psql.pipelineBatch()` and for the start of a self-owned transaction (`BEGIN`
shares the first statement's round trip), restoring the flag before release.
