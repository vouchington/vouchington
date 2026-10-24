# PostgreSQL Data Store

This package is the Vouchington adapter over
[`@vouchington/postgres`](https://github.com/vouchington/vouchington-platform/tree/main/packages/postgres).
It constructs the process singleton after local worktree connection guards, and keeps product
migrations, views, snapshots, and EXPLAIN ANALYZE capture here. Agent-only migration and query-change
rules live in [AGENTS.md](../../../backend/data-stores/psql/AGENTS.md); the schema rationale is in
[PostgreSQL Schema Quality Rules](../postgres-schema-rules.md).

## Contents

- [Connection Model](reference-connection-model.md)
- [Transactions](reference-transactions.md)
- [Cursors](reference-cursors.md)
- [Read-Then-Write Lookup Upserts](reference-read-then-write-lookup-upserts.md)
- [Migrations, Views, and Config-Driven](reference-migrations-views-and-config-driven.md)
- [Views](reference-views.md)
- [EXPLAIN ANALYZE Framework](explain-analyze/README.md)

## Dynamic SQL

- Compose optional predicates as a parenthesized group (`sqlOrGroup()` / `sqlAndGroup()`) before
  appending them to required filters: `AND` binds tighter than `OR`, so appending `OR ...` beside
  guarded filters can let rows bypass the guards.
- Identifiers cannot be parameterized. Validate them with `assertWhitelistedSqlIdentifier()` against
  a static allowlist, and validate combinations (a table paired with that table's own column), not
  just each string.
- Ordered cleanup and keyset scans need an index matching their stable filter and `ORDER BY`.

## Per-request query profile (API tests)

The API test server wraps every request in an `AsyncLocalStorage` profile fed by the
`onQueryTiming` hook, so unlike `runWithCapturedQueries` it sees in-transaction statements. Each
queue or job invocation in the in-process worker adapter gets its own profile so awaiting queue
admission never charges worker queries to the HTTP request's N+1 guard. `VITEST_DIAGNOSTICS=1` prints
one stderr line per request.

- **Repeat (N+1 suspect):** the same `/* annotation */` ran two or more times in one request. Cursor
  batches, pipelined batches, and transaction control are excluded; a per-item transaction loop is
  still caught by the statements repeated inside it.
- **Serial depth:** the largest set of non-overlapping query intervals, i.e. round trips on the
  critical path (`Promise.all` counts once, but not on a transaction client). "Round Trips" cells in
  `docs/requirements/api/**` mean serial depth. Depth is reported, not enforced.
- Valkey commands have no command hook and are not covered. Worker repeats are not enforced.

### Enforcement and the baseline

An unlisted repeated annotation within one API request fails the test that made the request.
[`request-query-profile-baseline.json`](../../../backend/test-helpers/api/request-query-profile-baseline.json)
records exceptions against their exact HTTP route and/or worker queue and job name. Worker scopes
are diagnostic only; they do not exempt or fail an HTTP request. An entry is either temporary,
owned by an open issue that removes the repeat, or permanent, for a repeat the code needs on purpose
(a re-read after a lock that rejects a concurrent change); its reason names the mechanism.
`parseRepeatBaseline` in
[`request-query-profile-baseline.mts`](../../../backend/test-helpers/request-query-profile-baseline.mts)
owns the exact fields, and the test setup rejects an entry that fits neither.

`request-query-profile-open-issues.mts` fails when a temporary entry's issue is not open. Static
Analysis runs it when a pull request or merge group changes the baseline, and the nightly run
checks it every day, so an issue closed elsewhere is still caught. It skips locally when no token or
`gh` login is available.

- **Add an entry** only for a repeat that cannot be fixed in the same PR; prefer fixing it. Link an
  open issue that owns the removal, or make the entry permanent when the code needs the repeat.
- **Remove an entry** in the PR that removes the repeat. A stale entry never fails a run, so a fix
  PR never depends on landing order; deleting it keeps the repeat from returning.
- **Find stale scopes** from one complete local pass or complete Backend workflow run with
  `VITEST_DIAGNOSTICS=1`. Combine all backend-unit shard logs and the ActivityPub capacity project
  log from that pass into one file, then run
  `NODE_ENV=test NODE_PREWARM=1 node backend/test-helpers/api/request-query-profile-stale.mts <run-log>`.
  Use the worktree's `WORKTREE_DIR`, `DATABASE_URL`, and `VALKEY_URL` printed by
  `./dev/initialize backend` inline with the command. The reader loads the API entrypoint's
  registrations without serving requests and uses the public route matcher to canonicalize
  previously collected paths. The report lists
  missing route and worker scopes separately. It treats a scope as absent only when logs contain
  diagnostics of that kind; missing or empty diagnostics cannot establish staleness. Remove only
  the named scopes, and delete an entry only when every listed scope is reported stale. Worker
  profiles remain report-only and do not enforce the request query guard.
