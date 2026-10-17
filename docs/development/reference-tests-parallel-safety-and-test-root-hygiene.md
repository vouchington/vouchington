# Parallel-Safety and Test-Root Hygiene

[Back to Tests and Checks](tests.md#parallel-safety-and-test-root-hygiene)

Backend database tests run in parallel forks against one persistent, dirty database. Shared test infrastructure that is not parallel-safe shows up as "flaky" CI failures. [Suite rules R1 and R2](tests.md#test-suite-rules) forbid creating a database or changing the schema from a test.

## Shared rows and locks

- **Materialized-view refreshes share one advisory lock.** `refreshMaterializedView` is nonblocking and throws a retryable error when another fork holds the lock. Tests that need a refresh to finish use `refreshMaterializedViewForTest`. Never replace the production lock with a blocking wait.
- **Exact global aggregates need owned windows.** Randomized ids prevent collisions but cannot isolate an exact query over a shared aggregate. Reserve an owned window with `acquireTestAiUsageDateReservation()` and register release with `onTestFinished`. Do not replace this with a production filter, unreserved random dates, or one global lock: those change product semantics, stay probabilistic, or serialize parallel tests.
- **Canonical URL upserts share one row.** `addUrl` returns the same `urls` row for the same normalized URL, so an absence assertion must use a URL the test just created. Do not reuse a fixed example URL or delete the shared row.
- **Jurisdiction policy approvals share one lock per jurisdiction.** Read-committed visibility means an uncommitted concealment still sees another test's committed approval. Concealment and approval inserts take the same transaction advisory lock; do not replace it with `LOCK TABLE`.
- **Catalogued shared-DB scan guard.** DB-backed projects install an observer that fails a file when a catalogued service sweep runs unscoped. Pass owned ids or a complete owned keyset cursor, and assert that an equally eligible unrelated fixture is excluded and unchanged. Timestamps, snapshots, and page sizes alone are not ownership scopes. The observer does not prove every SQL query scoped.
- **Stateful test helpers must be parallel-safe.** A module-scoped object exported from a helper is either created and torn down per test or append-only and keyed by a per-request or per-test discriminator. A shared mutable singleton with a reset endpoint lets one file wipe another's data.
- **Persistent dominant fixtures need deterministic cleanup.** A fixture that never decays out of a trending top-N (far-future UUIDv7, huge score) poisons that query for every later run. Use the self-cleaning `withDominantPostFixtures` helper so cleanup runs even on failure. This is a dataflow property, not a static rule.
- **Rate-limiter cleanup is ownership-scoped.** `invalidate()` scans and unlinks a whole Valkey prefix, wiping every fork's counters. Tests that mint a fresh identity need no cleanup; fixed-identity tests delete only their own exact keys through the production key builder. Lint bans the prefix-wide form.
- **Shared-storage overlap waits must observe in-flight state.** Counting lock requests does not prove two clients overlap; wait until the first request callback has run or the persisted owner-lease count shows both claimants.

## Fixtures

- Persisted usernames use `safeUsername()` and persisted emails use `createUniqueTestEmail()`. A bare `Math.random()` suffix can be all-numeric, which collides with phone-number route matching, or exceed the length limit.
- **ANN (pgvector) fixtures.** Approximate index scans make "fixture appears in results" a recall assertion. Give each row its own `makeNearbyEmbedding()` (identical vectors form an unreachable cluster); test sessions set `hnsw.ef_search` to the maximum so scans are effectively exhaustive.
- **Query-plan assertions.** A plan assertion inside the shared dirty database is the exception: parallel writers drift planner statistics and flip join order. New plan gates belong in the `explain-analyze` suite, which has an isolated container with no concurrent writers. When it must be the exception, the analyze step must cover every relation in the plan including join partners (the compiler enforces that a step exists; auditing its coverage is manual), capture only the one statement with `captureScopedTestQueries()` because process-global capture also records in-process worker SQL, and assert values that print the actual plan on failure. If a plan test flakes a fourth time, move it to `explain-analyze`.
- **Test-root hygiene.** Create temporary directories with `mkdtemp` under `RUNNER_TEMP` or `os.tmpdir()`, never `/tmp`, a fixed path, or a workspace directory: persistent CI runners keep `.git` directories and other artifacts that corrupt `existsSync` and recursive `readdir` results.
- When an async-generator mock completes or fails without streaming values, put `yield* []` right before the terminal `return` or `throw`, after parameter capture.
- Capture a deliberate async failure released by a lock or barrier immediately with `.catch(error => error)` and assert it after the holder finishes, so no assertion promise rejects unobserved.

## Live GlideMQ workers must not leak across isolate:false files

`backend-data-stores` runs forks with `isolate: false`, so importing a `createWorker(...)` singleton starts a real consumer for every later file in that fork. The test shim's `add()` blocks until attached workers drain the job, so once a worker is attached, `getJobs('waiting')` is deterministically empty and a failing job makes the enqueue call itself throw.

- Look enqueued jobs up by the returned id (`readEnqueuedJob`) or read all states (`readAllQueueJobs`), never `waiting` alone. A state list that omits `failed` turns a broken processor into "no job was enqueued". An unscoped absence assertion over an all-state read must follow `obliterate()` in the same test or gain a scoping predicate.
- `vitest.setup.glide-mq-workers.mts` allowlists the workers that may stay live. Close every other worker the file creates; the runtime attachment guard attributes a missed close to the owning file but does not close anything.
- A queue is exposed if any file in the same Vitest project attaches a worker to it; check the project's `include` and `exclude` globs, not just whether a workers test exists.
- The shim is fork-local, so cross-process locks add contention without isolating anything.

## Fake timers must be restored after every test

Fake timers are process-global. Under `isolate: false` a missing `vi.useRealTimers()` leaks into every later file in the fork. A root `afterEach` guard fails the test and restores real timers; relying on the next test's `beforeEach` breaks when that test is skipped or last. This is a runtime-state invariant: a correct hook pair and a stray `vi.useFakeTimers()` are indistinguishable at the AST level. When a spy wraps a fake timer global, call `vi.restoreAllMocks()` before `vi.useRealTimers()`, or the spy's restore callback reinstalls the fake later.

## Unexpected route-test 500s print the server error

Supertest reports only the status, and `onError` is silent under `NODE_ENV=test`. `createRequest()` records every 5xx response and prints it only when the test fails. A 500 from a global list usually means the test read rows it does not own.

## Failure injection uses a query executor

Pass a throwing `QueryExecutor` (`rejectQuery`) through the production query option to the targeted write. The wrapper is scoped to one test call, so it does not affect concurrent tests. Never install schema objects such as triggers for failure injection: they lock shared tables and can outlive a failed cleanup.

## Database-backed projects never reach AWS

An unstubbed S3 call in a database-backed project can only return 403 or hang, because the AWS SDK sets no connect timeout and the statement timeout does not cover it. These projects replace `S3Client.prototype.send` with an offline rejection. A test needing another answer spies on `send`; real S3 coverage stays in the credentialed `backend-aws` project. Other AWS clients are not covered by this default.

## Stuck statements and Valkey budgets

Tests bound each session with `statement_timeout`, and errored slow queries log a `[pg-query-failed] annotation=...` line, so a `57014` alongside that line is the intended, diagnosable outcome of a hung statement; follow the named annotation. DB-backed projects raise `VALKEY_REQUEST_TIMEOUT_MS` because the production fail-fast budget is too small under coverage-instrumented multi-fork contention; do not add per-test retries for ordinary Valkey commands.

## Compiler-backed contract tests

`loadBackendProgram()` shares one compiler program, via the upstream compiler cache, across independent PostgreSQL row checks. String-source contract suites build their virtual programs once in `beforeAll` with `buildVirtualProgramMatrix(import.meta, sources)`. A lint rule keeps TypeScript compiler-host, program, and language-service factories owned by the backend-program module, so contract tests do not construct their own. Do not reintroduce compiler discovery as a fixture or runtime-request acceptance gate.
