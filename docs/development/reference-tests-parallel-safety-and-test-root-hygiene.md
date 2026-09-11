# Parallel-Safety and Test-Root Hygiene

[Back to Tests and Checks](tests.md#parallel-safety-and-test-root-hygiene)

Three session retrospectives (2026-06-13 → 2026-06-15) traced repeated "flaky" CI failures to shared test infrastructure that was not parallel-safe. The patterns below are required for all new test helpers.

When an async-generator mock intentionally completes or fails without streaming values, use
`yield* []` immediately before its terminal `return` or `throw`. Keep parameter capture and deferred
`await` operations before that line so the mock retains the production generator's lazy timing
without emitting a dummy delta or requiring a `require-yield` suppression.

When a deliberate async failure is released by a lock, barrier, or other synchronization point,
immediately capture it with a non-rejecting `.catch(error => error)` promise when coordination must
finish before asserting. After the holder finishes, assert that captured result with
`await expect(capture).resolves`; do not store an assertion promise that can reject unobserved while
the test is still coordinating the race. The `no-mistakes/test-no-delayed-rejects` Oxlint rule
enforces this ordering for const promises later asserted with `expect(...).rejects`.

### Exact global aggregates need owned windows

Randomized fixture IDs prevent uniqueness collisions but cannot isolate an exact query over a shared
aggregate. AI-usage tests that assert `getDailyAiCostTotalMicrounits()` use the test-helper
`acquireTestAiUsageDateReservation()` API: it locks one of several independent slots, clears its
three-day UUIDv7 window before use and on release, and returns the center day. Register release with
`onTestFinished` immediately after acquisition. Do not replace this with a production filter, a
larger random namespace, or a single global lock; those either alter product semantics, remain
probabilistic, or unnecessarily serialize parallel tests.

### Stateful test helpers must be parallel-safe

A module-scoped object exported from a test helper must be **either** created/torn down per-test (`beforeEach`/`afterEach`) **or** be append-only and keyed by a per-request/per-test discriminator so concurrent test files cannot clobber each other.

The GlideMQ Vitest shim is fork-local, so a test's `crawl_urls` queue jobs and `obliterate()` calls cannot affect another Vitest process. Cross-process locks must not coordinate this isolation: they only add contention and can fail under the shared database statement timeout. Keep queue cleanup in the test that owns it, and scope assertions to that test's jobs where queue state is not freshly obliterated.

Membership catalog fixtures use per-test application identifiers. Fixed production entrypoint
tests use their existing internal catalog dependency seams with isolated fixture values instead
of mutating the shared production mapping — see [Test Helpers § Shared membership catalog rows](../../backend/test-helpers/README.md#shared-membership-catalog-rows).

**Correct — append-only + discriminator key:** `integration-tests/web/helpers/backend-trace-proxy.mts` stores traced requests in an unbounded append-only array. Each `client.getTraceRequests(requestId)` call filters by the `x-request-id` echoed from the response, so parallel test files see only their own traffic — no reset between tests is needed and none is possible. A regression guard lives at `integration-tests/web/tests/__tests__/backend-trace-proxy.test.mts`.

**Wrong — shared mutable singleton:** the pre-PR-#5471 trace proxy exposed a `POST /__trace/reset` endpoint; when two test files ran in parallel one file's reset deleted the other's recorded requests, producing intermittent 0-request assertion failures.

### Live GlideMQ workers must not leak across isolate:false files

`backend-data-stores` runs `pool: 'forks'` with `isolate: false`, so importing a
`new Worker(...)` singleton starts a real consumer for every later file in that fork. This is not a
timing race: the in-memory test shim's `add()` (`test-helpers/glide-mq-vitest-flush-wait.mts`)
blocks until every attached worker drains the job to a terminal state before resolving. So once a
worker is attached to a queue in the fork, `getJobs('waiting')` on that queue is _deterministically_
empty, and if the job ends `failed` unexpectedly the enqueue call itself throws, before any
assertion runs (#10984, Main CI backend run 34008968250; #11013).

`test-helpers/vitest.setup.glide-mq-workers.mts` is the allowlist of workers that may
stay live for side effects. Definition identity tests that import any other worker
module must close it before the file finishes, matching the OAuth and
activitypub-inbox `load()` tests in that file — closing the worker remains mandatory
regardless of how enqueue tests assert.

`backend-data-stores` also configures
`vitest.runner.glide-mq-worker-attachment-guard.mts`. After the project's setup files load but
before test-file collection imports a module, the runner captures the setup-created shim
`TestWorker` objects. It checks after each file suite has finished its own hooks, reports every
unexpected queue name in a deterministic failure, and intentionally does not close anything: the
owning test file must `await worker.close()` in its own `afterAll`. The guard is scoped to
`backend-data-stores`; other projects do not inherit this invariant.

Enqueue tests assert the persisted job by id instead of scanning `waiting`:
`backend/test-helpers/queue-jobs.mts` exports `readEnqueuedJob(queue, await enqueueX())`, which reads
the job back by the id the enqueue call returned, independent of its current state, plus
`isDeduplicatedEnqueue()` for the `null`-return dedup case. This is not a weakening — it asserts
`name`/`data`/`opts` on a specifically identified job, and asserts `null` for a deduplicated add
directly rather than inferring dedup from filter survivors. See
`backend/queues/post-publication/enqueues.test.mts` for the pattern, including a regression test that
attaches a no-op stub worker and proves the id-scoped read survives a live consumer draining the job.
Timing waits and polling remain forbidden.

**A queue is exposed** if any file inside the same Vitest _project_ attaches a worker to it —
regardless of whether that worker closes cleanly — because the drain happens for every later file in
the fork, not just the attaching file. Exposure does not travel with the queue name alone: a file can
be carved into its own project (`test-helpers/vitest-config/backend-data-projects.mts`) that excludes
every worker-attaching file for that queue, in which case the queue is not exposed there even though
the same queue is exposed inside `backend-data-stores`. Check the owning project's `include`/`exclude`
globs before deciding, not just whether some `workers.test.mts` exists in the repo.

Most assertions that don't have an enqueue return value to key off (an HTTP or service call, a
`Promise<void>` enqueue signature, a bulk enqueue) can't use `readEnqueuedJob`. For those, read every
job across all five states instead of just `waiting`: `readAllQueueJobs(queue)`, also exported from
`backend/test-helpers/queue-jobs.mts`, plus the `waitForQueueJobs(queue, predicate)` poller in
`backend/test-helpers/polling.mts` which is built on it. `'failed'` is not optional in that state
list — the shim surfaces a processor throw as a `failed` job, so a state list that omits it silently
turns a broken processor into "no job was enqueued." The same vacuity defect reaches through
`queue.searchJobs({ state: 'waiting', ... })` too; omit the `state` key there instead of picking a
different one, since the shim skips the filter entirely when it is `undefined`.

An all-state read returns every job the fork has ever put on that queue, since the shim never prunes
terminal records and `obliterate()` only clears them when a test explicitly calls it. A **scoped**
assertion (filtered by the test's own id/name/key) stays correct under that widening. An **unscoped**
absence assertion (`toHaveLength(0)`/`toEqual([])` with no predicate) is not: it must either sit
immediately after an `obliterate()` call in the same test (safe, since Vitest runs tests within a file
sequentially) or gain a scoping predicate before it can move off `waiting`.

These defenses solve separate parts of the contract. Use an all-state or id-scoped queue read so an
assertion remains valid when an intentional consumer drains a job; close every non-allowlisted worker
so later files cannot acquire a hidden consumer; rely on the runtime guard to report and attribute a
missed close at the owning file's boundary before a later `isolate: false` file is blamed for its
effects. The guard does not close the worker or stop later files from running. None substitutes for
another.

### Fake timers must be restored after every test

`vitest.config.mts` registers a root-level `setupFiles` entry,
`test-helpers/vitest.setup.fake-timer-guard.mts`, that runs an `afterEach` after every project's own
hooks and asserts `vi.isFakeTimers()` is `false` once the test finishes. Fake timers are process-global
state: under `pool: 'forks', isolate: false` a test that calls `vi.useFakeTimers()` without a matching
`vi.useRealTimers()` leaks into every later test file sharing that fork, not just later tests in the
same file (#8328); under `isolate: true` it still leaks into later tests in the same file. Relying on
the _next_ test's `beforeEach` to call `vi.useRealTimers()` is not a fix — it silently breaks the
moment that test is skipped, filtered out, or is the last one in the file, and it does nothing for
`isolate: false` cross-file leakage in the meantime. This has already caused two incidents
(#8328 hardened one shared-hook consumer against an already-fake clock; #8330 fixed one specific test
that only restored real timers on its happy path) — this guard prevents a _third_ occurrence instead of
special-casing another specific test.

This is a global `afterEach` invariant, not a static/lint rule, because the defect is purely about
runtime state: a correct `beforeEach`/`afterEach` pair and a stray `vi.useFakeTimers()` call are
indistinguishable at the AST level, so no `ast-grep` shape or `no-mistakes` check can tell them apart.

If this guard fails, add (or fix) an `afterEach(() => vi.useRealTimers())` in the offending file's
`describe` block, or wrap the test body in `try { … } finally { vi.useRealTimers() }` — do not rely on
another test's `beforeEach` to clean up after this one. The guard also calls `vi.useRealTimers()`
itself before throwing, so one flagged test cannot cascade into every test that runs after it in the
same fork. Set `VITEST_FAKE_TIMER_GUARD=off` to disable it for a run where the heuristic misfires. Its
pure check logic lives in `test-helpers/vitest-fake-timer-guard.ts` (unit-tested by
`test-helpers/vitest-fake-timer-guard.test.mts`, `ci-tools` Vitest project) — it mirrors the
pure/testable-core, thin-setupFile-wrapper split used by `test-helpers/vitest-fork-leak-detection.mts`
and its own `test-helpers/vitest.setup.fork-leak-detection.mts`.

### Shared-storage overlap waits must observe in-flight state

When two clients share durable storage, waiting on `lockManager.requestedNames.length` does not
prove overlap: one client can request both the storage lock and the allocation lock, and a second
request that completes immediately can clear storage before the first persists (#11016). Wait until
the first request callback has run, or until persisted owner-lease count shows both claimants,
before starting or asserting on the second client.

### Test-root hygiene

Always create temporary directories with `mkdtempSync` (or `mkdtemp`) rooted at `os.tmpdir()`. Never use `/tmp` directly, a fixed path, or a workspace directory as a test root passed to code that calls `existsSync` or recursive `readdir` — persistent CI runners retain `.git` directories and other artifacts across runs that cause wrong results.

```ts
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterAll } from 'vitest'

// Use RUNNER_TEMP on self-hosted runners to avoid /tmp/.git walk pollution.
const testRoot = mkdtempSync(join(process.env.RUNNER_TEMP || tmpdir(), 'voucha-mytest-'))
afterAll(() => rmSync(testRoot, { recursive: true, force: true }))
```

Good examples: `cloudflare-worker/scripts/wrangler/runtime.test.mts` (sync + try/finally), `backend/data-stores/psql/worktree-guard.test.mts` (`RUNNER_TEMP` fallback pattern).

### ANN (pgvector) fixtures

Vector similarity queries (`ORDER BY embedding <=> $query`) scan approximate HNSW indexes, so a test asserting a fixture appears in results is asserting index recall, not just SQL filters. Two rules keep that deterministic (Main CI run 28641733831 / issue #6781 is the failure mode: all eight `semantic.test.mts` tests missed their fixtures at once):

- Give each fixture row its own `makeNearbyEmbedding(queryVector)` from `@voucha/test-helpers`. Never store one identical vector on many rows — HNSW links duplicates to each other at distance 0, and the resulting cluster's graph reachability can fail wholesale.
- `vitest.setup.data-stores.mts` raises the test database's `hnsw.ef_search` to the pgvector maximum (`TEST_HNSW_EF_SEARCH` in `backend/test-helpers/vector-search-recall.mts`), which makes ANN scans effectively exhaustive at test-database scale. `backend/data-stores/psql/__tests__/vector-search-recall.test.mts` guards the setting.

### Query-plan (EXPLAIN) assertions

`profile-collection-query-plans.test.mts` was "stabilized" three times (#8196, #8643, #9042) before
#9042 found the real defect: `ANALYZE community_members` refreshed the driving table but not its join
partner `communities`, so concurrent writes from parallel Vitest forks (`pool: 'forks'`,
`isolate: false`) drifted planner stats far enough to flip the join order between fixture setup and
the EXPLAIN. The same uncovered-join-partner shape existed in `household-query-plans.test.mts`, whose
`analyzeHouseholdTablesForTest` covered `households, household_members` but not the `individuals` and
`users` tables also joined by `getHouseholdMemberships`.

- New plan-shape gates belong in the `explain-analyze` scenario suite (`plan-gates.mts`,
  `plan-pagination-gates.mts`), which runs against an isolated per-job container with no concurrent
  writers. A plan assertion inside `backend-data-stores` — a shared, dirty database written
  concurrently by parallel forks — is the exception, not the default.
- When it must be the exception, `explainCapturedTestQuery` (`backend/test-helpers/query-plans.mts`)
  requires a 4th `PlanStatisticsRefresh` argument, branded so only `definePlanStatisticsRefresh()` can
  mint one — an inline `async () => {}` does not typecheck. That callback must `ANALYZE` every
  relation the asserted plan touches, including join partners, not just the table the test itself
  writes to.
- Never collapse an extracted plan value to a boolean before asserting: `toContain`,
  `arrayContaining`, and `assert.ok(cond, msg)` all print the actual plan/index list on failure, while
  `expect(arr.some(...)).toBe(true)` prints only `expected false to be true`.
- Standing escalation: if a query-plan test flakes a fourth time, migrate it into the isolated
  `explain-analyze` scenario suite rather than tweaking `ANALYZE` timing again.

Whether an uncovered join partner exists is a dataflow property of the query the test captures, not
an AST shape — a lint rule checking "does this file call an ANALYZE helper in a hook" would have
passed #9042's actual bug, since the call existed and merely analyzed the wrong table set. The
checkable half (an analyze step exists at all) is enforced by the compiler via the required branded
parameter; the residual half (the analyzed set covers every relation in the plan) is a manual audit
recorded in the change that introduces or extends a query-plan assertion.

### Stuck statements fail as an attributable 57014, not an opaque 30s timeout

A hung Postgres statement in `backend-data-stores` used to surface only as vitest's bare `Error:
Test timed out in 30000ms.` — no query text, no annotation, no attribution — because
`getPsqlPoolConfiguration()` sets `statement_timeout: 0` (unbounded) for tests, so nothing bounded a
stuck statement below vitest's own `testTimeout: 30_000`. Two changes close that gap (CI run
33808851418 / job 100825925020):

- `vitest.setup.data-stores.mts`'s `globalSetup` binds the test database itself to
  `TEST_STATEMENT_TIMEOUT_MS` (`backend/test-helpers/statement-timeout.mts`, default 20s) via
  `ALTER DATABASE … SET statement_timeout`, exploiting the fact that pg's client (`pg/lib/client.js`)
  never sends a falsy `statement_timeout` in its startup packet — so every test session falls
  through to this database-level default instead of staying unbounded. Migrations,
  `beginBoundedTransaction`, and the advisory-lock helpers set their own session/transaction-local
  `statement_timeout` and are unaffected.
- `query-telemetry.mts`'s `recordQueryTiming` writes a `[pg-query-failed] annotation=<name>
pool=<pool> ms=<durationMs>` line to stderr for any errored query slower than
  `SLOW_QUERY_FAILURE_LOG_THRESHOLD_MS` (500ms) while running under test — the Postgres `57014`
  error itself carries no query text, so this is the only place that names the query.

So: a `canceling statement due to statement timeout` (`57014`) failure alongside a
`[pg-query-failed] annotation=…` line in a backend test is the intended, diagnosable outcome, not a
regression — treat the named annotation as the lead for the next investigation, the same way an
`EXPLAIN` plan or a fixture bug would be. `backend/data-stores/psql/__tests__/statement-timeout.test.mts`
guards the bound and its attribution wiring.

### DB-backed user fixtures

Fixtures that persist users to the database must generate usernames with `safeUsername()` from `@voucha/test-helpers`. Never use a bare `Math.random()` suffix — it occasionally produces all-numeric strings that collide with phone-number route matching in `getUserByAnyArguments`, and it can exceed the 50-character `validateUsername` limit.

```ts
import { safeUsername } from '@voucha/test-helpers/data'

const user = await createTestUser({ username: safeUsername('cmod') })
```

`safeUsername(label)` guarantees: starts with a letter, only `[a-z0-9-]`, ends alphanumeric, ≤ 50 characters, never all-numeric / phone-shaped / a UUID. A focused correctness test lives at `backend/services/users/safe-username.test.mts`.

The error-level
[`backend-persisted-user-random-username`](../../ast-grep-rules/backend-persisted-user-random-username.yml)
rule blocks direct random producers in explicit `username` properties at the known persisted-user
factories. The canonical static-analysis guide owns the
[exact syntax boundary and enforcement severity](../../static-code-analysis/README.md#enforcement-policy).

Persisted test emails must use `createUniqueTestEmail(prefix)` from
`@voucha/test-helpers/data`. It preserves a readable normalized prefix while adding a bounded,
cryptographically random suffix that remains unique during same-millisecond calls and keeps the
email local part within 64 characters. Do not use `Date.now()`, raw UUIDs, or bare `Math.random()`
suffixes for persisted email fixtures.

### Valkey request budget under test contention

DB-backed Vitest projects set `VALKEY_REQUEST_TIMEOUT_MS=5000` in
`test-helpers/vitest.setup.data-stores.mts` before creating any Valkey client. The production
500 ms fail-fast budget is intentionally too small for the artificial contention of a
coverage-instrumented multi-fork test process sharing one local Valkey. Explicit environment
overrides remain authoritative for timeout-focused tests and constrained runners; do not add
per-test retries for ordinary Valkey commands.

### Rate-limiter cleanup must be ownership-scoped, never prefix-wide

`RateLimiter#invalidate()` and static `RateLimiter.invalidate(prefix)` (from
`@data-stores/valkey-rate-limiter`) do a **SCAN + UNLINK over a whole Valkey prefix** — they delete
every concurrently running fork's counters for that concern, not just the caller's. A test that
calls either form corrupts sibling forks' rate-limit state, producing "flaky" failures that only
reproduce under parallelism (#8460, #8559).

- **Tests that mint a fresh identity already need no cleanup at all.**
  `createRequest()` assigns a unique IP via `nextTestRequestIp()`
  (`backend/api/test-helpers/server.mts`), so each test's rate-limit keys never collide with another
  test's. The web integration suite similarly creates fresh session/device state and a unique
  Worker-visible IP for its one email-login contract. Do not call `invalidate()` "just in case" —
  remove it.
- **Fixed-identity tests must delete only their own exact keys.** Route-rate-limit tests use
  `createRouteRateLimitKeyCleanup()` from `backend/services/route-rate-limits/test-support.mts`.
  `resetAndOwn()` snapshots ownership before the write and reuses the exact `buildRateLimitKeys()` /
  `getRouteConfig()` production uses; `cleanup()` deletes exactly those keys via the limiter's
  targeted `delete(...ids)` and retains failed scopes for the final retry — never the shared prefix.
  Other services must apply the same ownership rule: derive cleanup keys through the same
  production key builder that wrote them, or expose a test-support reset that captures the test's
  unique scope and unlinks only that scope's exact keys.

```ts
// Wrong — wipes every fork's counters for the whole prefix
afterEach(async () => {
  await Promise.all(Object.values(routeRateLimiters).map(rl => rl.invalidate()))
})

const cleanup = createRouteRateLimitKeyCleanup()
await cleanup.resetAndOwn(routeKey, identities)

// Correct — guaranteed teardown resets only this test's owned keys
afterEach(async () => {
  await cleanup.cleanup()
})
```

The Oxlint rule `voucha/no-prefix-wide-rate-limiter-invalidate` bans every statically named
`.invalidate` member read and object-pattern extraction in protected test and support paths,
regardless of receiver provenance. This syntax boundary covers direct imports, instances,
factories, parameters, containers, `this`, aliases, optional access, and `bind`/`call`; bare
`invalidate` identifiers and domain-specific reset functions remain valid. The
[`backend-no-prefix-wide-rate-limiter-invalidate-in-tests`](../../ast-grep-rules/backend-no-prefix-wide-rate-limiter-invalidate-in-tests.yml)
AST-grep rule complements it by banning known limiter/registry invalidation and the removed
broad-cleanup wrappers. Together they cover backend tests and test support, integration tests, and
Playwright. Their only path exceptions are the deliberate Valkey administrative flush and
Playwright global setup, where no concurrent test owns counters yet. The regression at
`backend/services/route-rate-limits/scoped-cleanup.test.mts` proves the scoped delete resets
only the caller's counter while a sibling identity's counter survives untouched.

### Persistent dominant fixtures require deterministic cleanup

A fixture with a far-future or max UUIDv7 timestamp, or a score large enough to outlast the decay
window, never time-decays out of a `hot`/trending top-N query. Left uncleaned, it permanently poisons
that ranked query for every later test run in the shared, dirty database.

Ordinary decaying high-score fixtures keep the existing "Result-set overflow" pattern above (a high
score plus a `minScore` filter) — no extra cleanup is required, since decay naturally retires them. A
**non-decaying** fixture (future-dated or too high-scoring to ever decay out) must be cleaned up even
on the failure path, using `withDominantPostFixtures(specs, run)` from
`backend/test-helpers/entities/trending-posts.mts`. The helper retains a private ownership list and
passes `run` a frozen readonly snapshot, so callback mutation cannot suppress owned cleanup or add
an unrelated post to it:

```ts
const farFutureDate = new Date('9999-12-31T23:59:59.000Z')

await withDominantPostFixtures(
  [{ createdAt: farFutureDate, postType: 'data_point', votesScoreUp: 2_000_000_000 }],
  async postIds => {
    const result = await getTrendingPosts({
      timeRange: 'day',
      postType: 'data_point',
      limit: 100,
      minScore: 2_000_000_000,
    })
    expect(result.results.some(row => row.id === postIds[0])).toBe(true)
  },
)
// The fixture is soft-deleted after `run` settles, even when `run` throws, so it never
// lingers to poison a later test's top-N — see get-trending-posts.test.mts's
// "dominant fixture cleanup on failure" case for the dirty-DB regression proving this.
```

This is a dataflow property (does a created id reach an ownership-scoped delete?), not a syntactic
shape, so it is not AST-grep-matchable — the same reason the fake-timer runtime-state invariant above
is a runtime guard rather than a static rule. The self-cleaning helper is the enforcement mechanism:
using it makes cleanup the path of least resistance instead of an easily-forgotten manual step.

### Compiler-backed contract tests

`loadBackendProgram()` (`backend/test-helpers/api-fixtures/backend-program.mts`) memoizes one shared
`ts.Program` while its compiler inputs and root set are unchanged — `ts.createProgram` is the
expensive step, and every contract loader (`loadBackendResponseContracts`,
`loadBackendRequestContracts`, `loadBackendQueryContracts`, the registered-route catalog) must
reuse it rather than rebuilding. Warm freshness checks reparse the backend compiler configuration
and replay the normalized, deduplicated filesystem decisions made by the exact CompilerHost that
built the program: file reads and existence, directory existence and listings, and realpath results.
That graph includes source inputs, package metadata and other module-resolution-affecting files,
failed file/directory lookups, and roots/configuration. Successful file reads use bigint `mtimeNs`,
`ctimeNs`, and size as a fast path; changed metadata rereads the file and compares its exact text.
Every build immediately replays its captured graph before publication and retries within a fixed
bound when a probe or root/configuration changes, so the accepted generation cannot pair SourceFile
text with a later disk snapshot. Added/deleted roots, deleted existing inputs, changed imported
dependencies, package.json changes, and newly satisfied failed lookups rebuild the program and
advance an opaque generation.

Every derived loader must call `loadBackendProgram()` before checking its own result cache and key
that cache by the returned generation. One generation change therefore invalidates response,
request, query, and registered-route results atomically rather than allowing an early derived-cache
hit to hide stale compiler inputs. `getBackendProgramBuildCount()` exposes a module-level counter
for this. The focused regression at
`backend/test-helpers/api-fixtures/backend-program.test.mts` uses
`resetBackendContractDiscoveryCachesForTest()` to clear only the four loader result caches and then
the shared program cache/counter. One lifecycle test loads every derived product twice across two
generations: identities stay stable within a generation, the physical build count does not advance
on warm calls, and a simulated input change advances the generation and invalidates all four
products atomically. A second real-program test marks one compiler capture stale and proves the
production composition discards it before publishing a later attempt. The bounded attempt loop
lives in `backend-program-settlement.mts`; its exhaustive retry, configuration handoff, terminal
error, and unexpected-error branches use in-memory tests instead of repeatedly building the full
backend program. Filesystem-probe freshness remains covered in `backend-program-freshness.test.mts`.
Use a small, structural filesystem host for a stable replay baseline or an individual tracked
operation: its `fileExists`, `readFile`, directory, and realpath answers are owned by the test
rather than ambient filesystem state that TypeScript can probe while it builds a program. Keep real
TypeScript compiler coverage narrow and observable: isolate the program to test-owned inputs (for
example, `noLib: true` and `types: []` for a single entry), then prove that it initially includes
the entry, its captured snapshot is fresh, and an exact source rewrite makes it stale. An ambient
`ts.createProgram()` capture must not use a pre-mutation freshness assertion as its baseline because
its filesystem probes can change during capture on shared CI hosts. This boundary preserves
regression coverage for both the tracker and its compiler integration without treating ambient
inputs as deterministic.

String-source contract suites use `buildVirtualProgramMatrix()` from
`backend/test-helpers/api-fixtures/virtual-program.mts`. Declare every named source for the file,
build the matrix once in `beforeAll` as `buildVirtualProgramMatrix(import.meta, sources)`, and
pass the shared program plus the requested source file to the lower-level discovery function. The
module-execution identity is structural: the helper rejects a second successful build for that
execution while allowing a watch rerun of the same file. The lifecycle rule requires the exact
`import.meta` argument so a synthetic owner cannot bypass that cardinality check. Each virtual file is an
independent module, and diagnostics are checked when that source is requested, so one expected
failure case does not poison its siblings.
`request-contract-registry.test.mts` follows this virtual-only rule. Its production Bluesky and
Fediverse request-body spot checks belong to `openapi/write-openapi.test.mts`, which resolves them
from the real OpenAPI document that file already builds and rejects missing or unavailable bodies;
do not add a second full backend-program load to the request inference suite.
The scope-aware Oxlint `voucha/backend-contract-program-construction-location` rule keeps TypeScript
compiler-host, program, and language-service factories owned by only `backend-program.mts` and
`virtual-program.mts`, including bracket and optional access, aliases, lexical shadows, and
the public compiler-host family (`createCompilerHost`, `createIncrementalCompilerHost`,
`createWatchCompilerHost`, `createSolutionBuilderHost`, and
`createSolutionBuilderWithWatchHost`) plus the program, incremental, builder, watch,
solution-builder, and language-service factory surface. `backend-program-freshness.mts` is a
TypeScript-independent structural filesystem-host decorator; the backend-program owner constructs
the host and passes it into that tracker. Directory listings keep the host's original path array
and order for TypeScript, while freshness compares a normalized, sorted, unique signature.
The rule follows protected factory provenance through direct calls and constructors, tagged
templates, decorators, standard `call`/`apply`/`bind` and `Reflect.apply`/`Reflect.construct`
invocation (including `Reflect.construct.call` and `Reflect.construct.apply`), and callable wrappers created by bound functions, subclasses, or an unshadowed global
`Proxy`. This is a bounded standard-syntax contract, not arbitrary callback analysis: passing a
protected factory into `map`, `then`, an event handler, or a coercion hook remains unsupported and
must not be used to construct contract programs.
It also rejects value exports that expose those factories or the virtual-matrix builder at their
first protected-module edge. Its same-named AST-grep companion covers the context-free exact named
imports, direct value re-exports, and awaited dynamic-import syntax; AST-grep does not infer
provenance from same-spelled local or domain factories. The companion
`backend-contract-virtual-program-matrix-lifecycle` rule rejects matrix construction outside the
callback directly passed to `beforeAll`; that callback must be the build call's nearest enclosing
function boundary, so nested, returned, or generator functions are invalid. It scans both tests and
non-test API-fixture helper modules so a helper cannot hide module-scope, per-call, or helper-owned
`import.meta` construction. Only the matrix implementation and its dedicated owner test are
excluded. Keep the builder under its direct value import name: value-import aliases, local aliases,
and property/destructuring extraction are banned because AST-grep cannot trace an extracted
function value to its eventual call site. Type-only aliases remain allowed.

Cold-build time and warm-assertion time are different budgets — conflating them under one constant
previously produced inconsistent per-file timeouts (15s vs 60s) that actually measured different
builds. `backend/test-helpers/api-fixtures/cold-build-budget.mts` exports three intentionally distinct
constants instead:

- `COLD_BACKEND_PROGRAM_TIMEOUT_MS` — the full `backend/tsconfig.json` type-check via
  `loadBackendProgram()`.
- `COLD_VIRTUAL_PROGRAM_TIMEOUT_MS` — one `buildVirtualProgramMatrix()` string-source build for the
  test file.
- `COLD_OPENAPI_BUILD_TIMEOUT_MS` — full OpenAPI document generation plus `redocly lint`.

Use the constant that matches what the test actually builds. A test that intentionally forces
multiple full backend program builds multiplies `COLD_BACKEND_PROGRAM_TIMEOUT_MS` by its exact
expected build count. A bounded-retry test uses the production maximum attempt constant instead,
preserving the per-build ceiling without applying a single-build budget to rebuild coverage. Do not
reintroduce a local `coldTypeScriptProgramTimeoutMs`-style constant in a new contract test.
