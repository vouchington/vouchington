# PostgreSQL Data Store

Source entrypoint: [backend/data-stores/psql/README.md](../../../backend/data-stores/psql/README.md)

Shared PostgreSQL runtime and schema reference for Voucha backend services, APIs, workers,
migrations, and query profiling.

This package is the Vouchington adapter over [`@vouchington/postgres`](https://github.com/vouchington/vouchington-platform/tree/main/packages/postgres).
It constructs the process singleton (`voucha` database name, `@modules/on-error`, analytics
sampling) after local worktree connection guards, and keeps product migrations, views, snapshots,
and EXPLAIN ANALYZE capture here. Agent-only migration and query-change rules live in
[AGENTS.md](../../../backend/data-stores/psql/AGENTS.md).

## Contents

- <a id="exports"></a>[Exports](reference-exports.md)
- <a id="connection-model"></a>[Connection Model](reference-connection-model.md)

## Vitest Fork-Leak Context

When the pools are already initialized in a Vitest fork, the fork-side resource-leak diagnostic
reports each pool's `total`, `idle`, derived `non-idle-or-connecting`, and `waiting` counts. This
is formatter-only context for investigating `TCPSocketWrap` growth: it never initializes a pool,
subtracts pool totals, or changes the raw `process.getActiveResourcesInfo()` detector decision. See
[Graceful Shutdown § Fork-Side Leak Detection](../../overview/architecture/graceful-shutdown.md#fork-side-leak-detection)
for the detection state machine and [CI Reference](../ci.md) for its CI
diagnostic.

## Scoped Transaction Query Completion

`runWithCapturedQueries` in [`query-capture.mts`](../../../backend/data-stores/psql/query-capture.mts)
retains its scoped SQL capture and handler result, and always records completed transaction
snapshots. Its handler context provides `subscribe(listener)` with synchronous, idempotent
unsubscribe. Live events retain original executor, promise, and rejection identities; snapshots
contain copied serializable SQL values, status, and guarded error summaries. Existing consumers
may ignore the added diagnostics; existing artifacts do not serialize them automatically.

Handler settlement deactivates listeners immediately. Returning the handler result does not wait
for unfinished descendants: consumers needing cleanup explicitly await the nonthrowing
`completionDrain` after releasing held resources and settling their owned work. Rejected handlers
retain their original error. Metadata and callback failures cannot replace query results or
rejections. The wrapper calls the real executor once and returns its original promise. Raw pools
and unwrapped autocommit queries are outside this boundary. Completed advisory-lock SQL proves
acquisition, not entry into a later server-side lock wait.

## Per-Request Query Profile (API tests)

The API test server ([`server.mts`](../../../backend/test-helpers/api/server.mts)) wraps every
request in an `AsyncLocalStorage` scope ([`request-query-profile.mts`](../../../backend/data-stores/psql/request-query-profile.mts)).
The `onQueryTiming` hook feeds it for every query, including `transaction.query()`, so unlike
`runWithCapturedQueries` it sees in-transaction statements. Outside a scope (production, workers,
non-API tests) the hook returns on its first line. When the response finishes, a request with a
repeated annotation writes one stderr line:

```text
[pg-request-profile] route=GET /v1/posts/:id queries=14 serialDepth=6 repeats=getUserById(x5),getPostMedia(x3)
```

- **Repeat (N+1 suspect):** the same `/* annotation */` ran two or more times in one request.
  Cursor-batch iteration (`cursorBatches`) and pipelined batches are one logical statement and are
  excluded.
- **Serial depth:** the largest set of non-overlapping query intervals (start = completion time
  minus `durationMs`), i.e. round trips on the critical path. `Promise.all` queries count once, but
  `Promise.all` on a transaction client still runs serially. "Round Trips" cells in
  `docs/requirements/api/**` mean serial depth.
- `BACKEND_TEST_REQUEST_QUERY_REPORT=all` prints a line for every request, not only those with repeats.
- Queries finishing after the response flushes, and Valkey commands (no command hook exists yet),
  are not covered.

### Enforcement and the baseline

The profile is enforced. A repeated annotation within one API request that is not in
[`request-query-profile-baseline.json`](../../../backend/test-helpers/api/request-query-profile-baseline.json)
fails the test that made the request, with a message naming the route and the annotation. The
response `finish` handler records the violation and
[`vitest.setup.request-query-profile.mts`](../../../backend/test-helpers/vitest.setup.request-query-profile.mts)
throws it from `afterEach` (and `afterAll`). Serial depth is reported, not enforced.

Each baseline entry is `{ annotation, reason, issue }`: the annotation, why the repeat is tolerated,
and the number of the open issue that removes it. The baseline is per annotation, not per route.

- **Add an entry** only for a repeat that cannot be fixed in the same PR. Prefer fixing the repeat.
  Link an existing issue that owns the area, or file one in the "Query round-trip reductions"
  milestone, and write a one-line `reason`.
- **Remove an entry** in the PR that removes the repeat. A stale entry never fails a run, so a fix
  PR never depends on landing order; the entry is still deleted so the repeat cannot return.
- **Find stale entries.** A data-dependent repeat can be missing from any single run, and one
  process sees only a slice of the routes, so staleness is computed over several complete runs, not
  in the test run. Save the logs of the 5 most recent completed main merge-group Backend runs
  (every `test-backend-unit` shard and credentialed job of each, via
  `gh run view <id> --log --job <job-id>`), concatenate each run's shard logs into one file, and run
  `node backend/test-helpers/api/request-query-profile-stale.mts <run-log>...`. An entry is listed
  only when it is absent from every log; delete it only then. The report prints how many logs it
  used and warns that the result is not safe to act on when given fewer than 5. It always exits
  successfully.

## Query access references

- <a id="query-helpers"></a>[Query Helpers](reference-query-helpers.md)
- <a id="read-then-write-lookup-upserts"></a>[Read-Then-Write Lookup Upserts](reference-read-then-write-lookup-upserts.md)
- <a id="transactions"></a>[Transactions](reference-transactions.md)
- <a id="cursors"></a>[Cursors](reference-cursors.md)
- <a id="migrations-views-and-config-driven"></a>[Migrations, Views, and Config-Driven](reference-migrations-views-and-config-driven.md)

## Schema Object Buckets

- <a id="explain-analyze-tooling"></a>[EXPLAIN ANALYZE Tooling](reference-explain-analyze-tooling.md)
- <a id="schema-conventions"></a>[Schema Conventions](reference-schema-conventions.md)
- <a id="ids-and-primary-keys"></a>[IDs And Primary Keys](reference-ids-and-primary-keys.md)
- <a id="timestamps"></a>[Timestamps](reference-timestamps.md)
- <a id="constraints-and-validation"></a>[Constraints And Validation](reference-constraints-and-validation.md)
- <a id="postgresql-18-features"></a>[PostgreSQL 18 Features](reference-postgresql-18-features.md)
- <a id="indexing"></a>[Indexing](reference-indexing.md)
- <a id="partitioning"></a>[Partitioning](reference-partitioning.md)
- <a id="views"></a>[Views](reference-views.md)
- <a id="embeddings-and-external-metadata"></a>[Embeddings And External Metadata](reference-embeddings-and-external-metadata.md)
- <a id="topic-additional-hostnames"></a>[Topic Additional Hostnames](reference-topic-additional-hostnames.md)
- <a id="when-to-read-which-file"></a>[When To Read Which File](reference-when-to-read-which-file.md)
- <a id="related"></a>[Related](reference-related.md)
