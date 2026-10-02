# Test Helpers

Source entrypoint: [backend/test-helpers/README.md](../../../../backend/test-helpers/README.md)

Testing utility library for the Voucha backend. See [AGENTS.md](../../../../backend/test-helpers/AGENTS.md) for agent conventions and rules.

SQL setup and assertions are grouped by concern in `sql-*.mts` (posts, RSS feeds, topics,
moderation, feed shares, follower distribution, URLs, configuration, and agent prompts).
Language detection separates fixture creation from state assertions, and `sql-query-inputs.mts`
owns SQL fragments used to exercise query builders. The main helper barrel exports each helper
directly from its owner. Membership schema tests import purchase-intent fixtures and verification
assertions from their separate owners under `data-stores/psql/`.

[`withAbortedPostgresTransactionForTest`](../../../../backend/test-helpers/postgres-aborted-transaction.mts)
executes division by zero through its owned raw client, checks PostgreSQL's `22012`, and lends
the aborted transaction to a service callback. The query wrapper has not cached that setup error,
so the service's actual SQL reaches PostgreSQL and receives `25P02`. Use it to verify propagation
without partial writes; resource disposal rolls the transaction back afterward.
The [PostgreSQL row-contract probe](../../../../backend/test-helpers/data-stores/psql/query-row-contract.mts) keeps its read-only SQL
and explicit projection type inside a focused helper. Its owning PSQL test imports that helper by
relative path, following other PSQL tests without adding a `@data-stores/psql` →
`@voucha/test-helpers` package dependency cycle; the test only asserts the returned parser values.

Route suites that jscpd reports together call one registrar from a literal `describe` in each
test file. The registrars live next to this README: vote lists, scoped credential pagination,
community claim and escalation routes, mod-internal-thread routes, RSS feeds, user list item routes, landing-page analytics, similarity search, and topic referral and rewards program attributes.
Community application and invite list GETs share
[`registerCommunityListGetAuthTests`](../../../../backend/test-helpers/community-list-get-auth-tests.mts).
The applications suite keeps private visibility on the moderator success case and the `apps-get-*`
slug prefixes. The invites suite omits visibility and keeps the `invites-get-*` prefixes.
Passkey and TOTP rename routes share
[`auth-credential-rename-tests.mts`](../../../../backend/test-helpers/auth-credential-rename-tests.mts).
Each file keeps its path, insert helper, suffix, and renamed label.
Public and admin MCP rate-limit suites share
[`registerMcpRateLimitTests`](../../../../backend/test-helpers/mcp-rate-limit.mts).
Each route keeps its literal suite name, path, and OAuth audience and scope; the registrar owns
scoped configuration restoration, fresh user/IP fixtures, and rate-limit audit assertions.
Bookmark bloom-filter suites share
[`registerBookmarkBloomFixture`](../../../../backend/test-helpers/bookmark-bloom-fixture.mts).
Its getters expose the user and relation names after setup. Hooks drain pending bloom work before
deleting that user's filter and restore the original configuration on suite teardown.
Copyright email-intake and form-screening enqueue tests share
[`copyright-agent-enqueue-recovery-tests.mts`](../../../../backend/test-helpers/copyright-agent-enqueue-recovery-tests.mts).
Each file keeps its queue name, payload, and expected job options.
Post and topic revision diffs share
[`revision-change-detection-tests.mts`](../../../../backend/test-helpers/revision-change-detection-tests.mts).
The post and topic field tables stay separate.
Staff route request-contract suites share
[`registerStaffRequestContractTests`](../../../../backend/test-helpers/staff-request-contract-matrix.mts):
each case is a malformed request that must answer `401` for an anonymous caller and `403` for a
caller without the role, both with no schema diagnostic, and a bounded status (default `422`) for
staff. Each suite keeps its own routes and bodies.
The appeals and disputes list query suites share
[`registerCaseListQueryContractTests`](../../../../backend/test-helpers/case-list-query-contract-tests.mts):
each file passes its list path and response key, and the registrar owns the `401`, fractional-limit
`422`, lenient-fallback, and cursor `400` cases.
Post, topic, domain, and URL list-item mutations share
[`describeCommunityListItemRoutes`](../../../../backend/test-helpers/community-list-item-routes.mts).
Topic list reads stay in the topics suite.
Crawl URL redirect suites share the injected fetch mocks, `crawlUrl` wrapper, test user, and HTML
result fixture from
[`services/crawls/crawl-url-redirect-harness.mts`](../../../../backend/test-helpers/services/crawls/crawl-url-redirect-harness.mts).
Each file keeps its own cases.
Facebook and X friend-sync batching tests share account setup, the deletion-fence page commit, and
bounded stale-row cleanup in
[`services/oauth/friends-batch-sync.mts`](../../../../backend/test-helpers/services/oauth/friends-batch-sync.mts).
Each file keeps its `undici` `vi.mock` and that provider's page payload.
Captcha route tests share the Turnstile fixture token from
[`captcha/test-captcha-token.mts`](../../../../backend/test-helpers/captcha/test-captcha-token.mts). The Turnstile `fetch` mock
factory stays in [`captcha/undici-mock.mts`](../../../../backend/test-helpers/captcha/undici-mock.mts); each consumer keeps its own
`vi.mock` call. Lemmy no-data adapter tests share the host, view payloads, combined cursor shape,
request reader, and `undici` fetch mock from
[`lemmy-no-data-fixtures.mts`](../../../../backend/test-helpers/lemmy-no-data-fixtures.mts). Those
tests keep the `.no-data.mock.test.mts` suffix so Vitest selects `backend-no-data-mocks`.
Agent and manual community unpublish lock-order cases share
[`expectUnpublishHoldsPublicationLockWhileWaitingOnReview`](../../../../backend/test-helpers/entities/community-post-review-publication-lock.mts).
Each case keeps its title, slug prefix, review-lock SQL comment, member setup, unpublish call, and result assertion.

## `onceEntityListenerCompleted`

Use this to wait for a specific entity-listener job to complete after a fire-and-forget `enqueueOn*` call in a service. Entity listener side effects (auto-subscribe, auto-vote, notifications, cache invalidation) are asynchronous — tests that assert on them must wait.

**Signature:** `onceEntityListenerCompleted(jobName, entityId?, count?, timeoutMs?)`

- Always pass `entityId` to match the specific entity's job, not just any job with the same name running concurrently in other tests.
- Times out with a clear error after 15s by default.

**Concurrent waits — use `Promise.all`:**

```ts
// Wrong — post3's event can fire while we're still waiting for post1
await onceEntityListenerCompleted('processPostCreated', post1.id)
await onceEntityListenerCompleted('processPostCreated', post2.id)
await onceEntityListenerCompleted('processPostCreated', post3.id)

// Correct — all listeners registered before any can be missed
await Promise.all([
  onceEntityListenerCompleted('processPostCreated', post1.id),
  onceEntityListenerCompleted('processPostCreated', post2.id),
  onceEntityListenerCompleted('processPostCreated', post3.id),
])
```

**When to use it:**

- After creating an entity that triggers auto-votes, auto-subscribe, or notifications, when the test asserts on those side effects.
- When testing sort-by-score/best pagination: vote scores change asynchronously via entity listeners, so wait before paginating to ensure stable scores.
- After deletions/updates that trigger downstream cache invalidation.

## `onceElectionVoteStatsCompleted`

Use `election-vote-stats.mts` after a vote when a test reads the asynchronously recomputed election
aggregate. Pass the canonical job target `{ electionId, orderingKey }`, including `relationTable`
for `entity_relation` jobs, so a job for another election kind or relation table cannot satisfy the
wait. See the [election-votes service](../../../overview/architecture/services/elections-votes/README.md) for an example.
Its test runs in `backend-data-stores`, retaining worker setup and data-store teardown even though
the helper and test live together here.

## `readEnqueuedJob` / `isDeduplicatedEnqueue` / `getEnqueuedJobId`

Read an enqueued job back by id (`backend/test-helpers/queue-jobs.mts`) instead of scanning
`queue.getJobs('waiting')`. `backend-data-stores` runs `isolate: false`: if any worker is attached to
a queue in the fork, the in-memory shim blocks `add()` until the job reaches a terminal state, so
`waiting` is deterministically empty the moment a worker exists — see
[Parallel-Safety § Live GlideMQ workers must not leak across isolate:false files](../../reference-tests-parallel-safety-and-test-root-hygiene.md#live-glidemq-workers-must-not-leak-across-isolatefalse-files).

```ts
const enqueued = await enqueueReconcilePostPublication({ deduplicationId })
const job = await readEnqueuedJob(postPublication, enqueued) // resolves by id, any state
expect(job).toMatchObject({ name: 'processReconcilePostPublication', data: {} })
```

- `readEnqueuedJob(queue, enqueued)` — resolves the persisted job for an `await enqueueX()` result.
  Throws if the enqueue was deduplicated or the record is missing.
- `isDeduplicatedEnqueue(enqueued)` — `true` when the enqueue returned `null` (deduplicated/skipped);
  use it to filter concurrent enqueue results before asserting dedup directly, e.g.
  `results.filter(r => !isDeduplicatedEnqueue(r))`.
- `getEnqueuedJobId(enqueued)` — the id extraction `readEnqueuedJob` uses internally; exported for
  callers that only need the id.

See `backend/queues/post-publication/enqueues.test.mts` for the full pattern, including a regression
test that attaches a no-op stub worker and proves the id-scoped read survives a live consumer
draining the job. More GlideMQ testing patterns: [GlideMQ testing](glide-mq-testing.md).

## Reducing Entity-Listener Load

Entity listener jobs (processUserCreated, processTopicCreated, processPostCreated, etc.) run asynchronously in the in-process TestWorker. Under high concurrency, a large backlog causes test timeouts.

**Use direct-insert helpers when tests don't need listener side effects:**

| Service function (fires listeners)  | Direct helper (no listeners)                             |
| ----------------------------------- | -------------------------------------------------------- |
| `createTestUser(...)`               | `createTestUserDirect(...)`                              |
| `createTopic(user, { name, slug })` | `insertTestTopic({ name, slug, createdById })`           |
| `createPost(user, { ... })`         | `insertTestPost({ title, slug, createdById, markdown })` |

**Share fixtures across tests with `beforeAll`:**

```ts
// Wrong — fires processUserCreated for every test
test('foo', async () => { const user = await createTestUser() ... })
test('bar', async () => { const user = await createTestUser() ... })

// Correct — fires processUserCreated once, shared across tests
let user: PrivateUser
beforeAll(async () => { user = await createTestUser() })
test('foo', async () => { ... use user ... })
test('bar', async () => { ... use user ... })
```

The persisted-user creators `createTestUser`, `createTestUserDirect`,
`createUnonboardedTestUserDirect`, and `createTestUserWithAge` return a `PrivateUser` or reject when
their inserted row cannot be read back. `getTestPrivateUserById` remains a nullable lookup for tests
that need to assert absence.

**Parallelize independent entity creation with `Promise.all`:**

```ts
// Wrong — sequential, each createTrendingTopicData fires many entity listeners serially
for (let i = 0; i < 5; i++) {
  const data = await createTrendingTopicData({ ... })
}

// Correct — parallel, all 5 datasets created concurrently
const datasets = await Promise.all(
  Array.from({ length: 5 }, (_, i) => createTrendingTopicData({ ... })),
)
```

## Fetch-Safe Local HTTP Servers

Use `createFetchSafeTestServer()` from `@voucha/test-helpers/fetch-safe-test-server` when a
test starts a localhost HTTP server and calls production `fetch()`/undici against it.
`server.listen(0)` can choose Fetch-forbidden ports such as `6667`, which undici rejects before
opening a socket, or the deterministic Playwright runner range `2200–2999`. The helper rejects both
classes through the shared runner port binder; direct ephemeral listener binds are statically
forbidden outside that policy owner.

```ts
const server = await createFetchSafeTestServer((_req, res) => {
  res.end('ok')
})

try {
  const response = await fetch(server.url('/health'))
  expect(await response.text()).toBe('ok')
} finally {
  await server.close()
}
```

## Focused PostgreSQL Test Operations

Backend tests never import PostgreSQL executors or `sql-template-strings`. Put schema setup,
mutation probes, and database assertions in a domain-named module under `data-stores/psql/**`, then
export only typed operations and results that describe the tested behavior. Keep `read`, `write`,
`query`, transaction clients, and SQL statement objects private to the helper implementation.

These helpers preserve direct database-constraint coverage while keeping SQL out of test files. A
helper should identify the operation it performs, such as rejecting a refund-intent mutation or
reading a current membership projection; do not replace raw SQL with a generic execute wrapper.

### Lock-wait actions

Lock-wait helpers observe a started action with a local settled outcome before polling PostgreSQL.
They release their holder before returning the fulfilled value or rethrowing the original rejection;
an action that fulfills before blocking keeps the helper's completed-before-blocking diagnostic.

When a centralized helper must exercise its former owning workspace directly, use an explicit
source-relative import. Do not add that higher-layer workspace to `@voucha/test-helpers` and create
a package cycle merely to preserve an alias that was valid before the helper moved.

## PostgreSQL Query Pool Observation

Use `observeTestPostgresQueryPools(queryMarker, operation)` when a service test must prove that a
tagged query uses the read or write pool. The helper serializes observations and restores both pool
query properties after success or failure. Pass the SQL comment that uniquely identifies the query;
the result includes the operation result and the ordered set of matching pools.

```ts
const observed = await observeTestPostgresQueryPools('/* getEntityById */', () =>
  getEntityById(id, { readOnly: false }),
)
expect(observed.pools).toEqual(['write'])
```

Use `withPostgresQueryFailureForTest(queryMarker, operation, { command })` from
`@voucha/test-helpers/postgres-query-failure` to verify an owned transaction's storage-error
propagation and rollback. It shares the pool observer's serialization queue, instruments only
clients acquired in the callback's async context (or its explicit owned HTTP request ID), and
restores their properties before release.
The exact leading SQL annotation selects one statement; `command` distinguishes statements that
share an annotation. After the owner sends `BEGIN`, the helper runs actual division-by-zero SQL
directly on that client, then forwards the service's original statement unchanged. The returned
`error` is PostgreSQL's actual `25P02` error, so a callback that captures a propagated error can
assert identity as well as persisted state. Matching statements must use the adapter's plain-config
Promise API; callback pool queries and other async contexts are forwarded untouched. Do not nest
this helper and a pool observation. Use the borrowed aborted-transaction helper above when the
service already accepts a transaction query.
For a borrowed-query service that needs a healthy transaction first,
`withPostgresTransactionForTest(operation)` waits for the operation, then rolls back its owned
transaction on disposal. Keep this operation inside the fault helper's callback when injecting a
later statement failure.
`withPostgresAdvisoryLockQueryFailureForTest` scopes a fault to an owned advisory-pool client.
It runs actual transaction-aborting SQL immediately before the exact original release query;
the service owns `release(true)`, which closes that session and releases only its locks. The
helper restores properties and waits for the actual bounded client-close event, retaining both
processing and cleanup errors if closure fails.

For a statement executed by the global read/write pool rather than an owned transaction, use
`withPostgresPoolQueryFailureForTest` from `@voucha/test-helpers/postgres-pool-query-failure` with
the same annotation, callback, and optional command. It acquires a real idle client, begins and
aborts its server transaction, then lets the unchanged `pg.Pool.query` implementation acquire that
client through a one-shot lease and execute its original SQL. Before handoff the helper destroys
the client on failure; after handoff the pool core owns `release(error)`, which destroys the
connection and rolls back. Cleanup waits for that client's bounded `end` event. A transaction
wrapper would give two owners responsibility for the same release, so the test-only setup has a
scoped manual-transaction lint exception.

Real HTTP requests do not inherit the test callback's async context. For those tests, pass a fresh
UUID as `requestId` and the same `x-request-id` header. Both fault helpers match the production request
context exactly, in addition to the SQL annotation; never use a global marker-only interception.
Assert the response's request ID and verify a different request ID remains healthy while the fault
is installed. Direct service/tool calls use the default async-context scope.

For owned blacklist fixtures, `deleteTestBlacklistSource(sourceId)` removes the exact source and
its foreign-key-owned entries. Never clear the shared Bloom filter; use a fresh random hostname.
`getTestGooglePlayVerificationRetryState(id)` reads the owned verification's claim and retry
metadata when asserting that a real processing failure releases its lease and records retry state.
`getTestPostModerationAttemptStateForPost(postId, source)` reads the latest attempt and its work
lease for one owned post/source when asserting durable worker failure and retry state.
`provider-http` supplies actual Undici `MockAgent` HTTP parsing for injected provider fetches;
its default-export fetch observer restores the external SDK method even when processing throws.
`withTruncatedHttpResponseForTest` owns a loopback HTTP server and Undici dispatcher. It verifies
the expected synthetic provider URL, returns actual response headers, then terminates only that
response socket to exercise production body-reader and network-error classification. Its callback
receives the real transport and request count; server and dispatcher close after the callback.

## Notification Push Recovery Backlogs

Use `withTestNotificationPushRecoveryBacklog()` from
`@voucha/test-helpers/notification-push-recovery` for a fixed recovery snapshot spanning multiple
pages. It pins owned intent timestamps to one isolated cursor window, exposes a frozen ordered ID
snapshot and endpoint-state readers, and deletes only its owned notifications after the callback
settles.

## Image Moderation Fixtures

Image moderation tests share `createCompletedModerationImage()` and
`createImageModerationResult()` from
`@voucha/test-helpers/services/openai-moderation/image-moderation`. The first creates a completed
upload through `createImageUploadUrl` and `markImageComplete`. The second builds an omni-moderation
result whose image-capable categories report an `image` input. Quarantine assertions stay in the
quarantine test.

## Assessed US DMCA Notice Fixture

Copyright persistence and restoration-retry tests share
`createAssessedUsDmcaCopyrightNoticeFixture()` from
`@voucha/test-helpers/copyright-us-dmca-notice-fixture`. It creates a claimant, a moderator, a
hosted image placement, a US DMCA notice, a compliant assessment, and a claimant receipt. Each
caller passes its own post title and slug prefixes, markdown, claimant display name, notice body,
receipt idempotency prefix, and whether the assessment is recorded before the receipt. Legal
outcomes, jurisdictions, and assertion cases stay in the owning test.

## Copyright Intake Environment

Call `useCopyrightIntakeEnvironment()` from
`@voucha/test-helpers/services/copyright-notices/intake-environment` inside a `describe` block
whose tests reach a new-intake route (`POST /api/v1/copyright-notices`,
`POST /api/v1/copyright-eu-notices`, `POST /api/v1/copyright-uk-notices`). Before each test it
stubs `COPYRIGHT_INTAKE_ENABLED` plus the evidence, email, and media-delivery settings that
`assertCopyrightIntakeEnabled()` requires, and it unstubs every environment variable after each
test. Pass `{ enabled: false }` to keep that configuration but turn the switch off, so a 503 proves
the switch alone closed intake. The helper does not mock AWS; add `installTestMediaDeliveryEdge()`
when the test publishes delivery changes.

## REST Usage Metering

REST usage-quota suites share `@voucha/test-helpers/rest-usage-meter`.
`registerRestUsageRoutes(base)` registers the read, 404, 500, IP-only, repeated-boundary, and 202
write routes a suite calls, all under its own `base` so two suites on one app never collide. Call
`useRestUsageMetering(analyticsPrefix)` inside a `describe`: route rate limiting is off under test,
so it switches the kill switch on for each test, restores the config afterward, and starts a local
analytics directory. `waitForUsageRows(userId, count)` and `waitForAnonymousUsageRows(count)` wait
for the `api_usage` rows, which land just after the response closes, and `usageQuotaKeys()` lists
every usage-quota Valkey key so a test can prove no IP, device, or session id reached one. Valkey
and the analytics directory are shared across forks, so assert on a user's own bucket and rows;
anonymous rows have no owner, so count them relative to a prior read. The row readers live in
`@voucha/test-helpers/api-usage-analytics`.

## Surviving a Dirty Database

The DB accumulates rows from every test run and is never cleaned. These patterns prevent flaky tests.

### Runtime guard for catalogued shared-DB scans

DB-backed Vitest projects install `vitest.setup.shared-db-scope-guard.mts` and the shared-DB
runner. The finite catalog in `backend/data-stores/psql/shared-db-scope-observer.mts` names
staff heads and selected recovery/sweep service calls. When a test executes one of those calls,
it must pass owned IDs/keys or a complete, actually bound keyset cursor. A date window,
`scanBefore`, or `LIMIT` alone does not isolate rows. An explicit empty ID array is a no-query
no-op. Production callers may still request a global scan: the observer is inert without the
test setup.

The guard records a violation even if the service error is caught. The file runner reports it
after `afterAll`, including setup/import failures, and retains per-file reported counts across
`isolate: false` files and `vi.resetModules()`. The backend-data-stores runner also checks for
leaked GlideMQ workers. The catalog is intentionally finite, not a SQL-wide interception rule;
new global-head or sweep services require an explicit catalog and bound-scope review. See the
[parallel-safety reference](../../reference-tests-parallel-safety-and-test-root-hygiene.md#catalogued-shared-db-scan-guard).
Intentionally global cases run through `test-helpers/vitest-isolated-database-case.mts` against a
fresh, disposable local database. The registry in `test-helpers/vitest-isolated-database-cases.mts`
names each case's file and test. Their real assertions run without scanning or mutating another
test's shared fixtures. Register a test's `fullName` in the form `suite > test`, the form Vitest
matches `testNamePattern` against and reports; the registry type rejects any other separator. A
child that exits 0 after skipping the test or running no test would otherwise pass silently, so the
child config's reporter lists every collected test and the parent fails unless exactly one test
with the registered name passed and none failed.
`VITEST_ISOLATED_DATABASE_CASE` and `VITEST_ISOLATED_DATABASE_CHILD` are harness-owned, validated
child markers, not settings for test authors to supply.

### Exact global AI-usage aggregates

Randomized IDs isolate fixture ownership, but they cannot isolate a query that sums every
`ai_usage_records` row in a day. Tests making exact assertions through
`getDailyAiCostTotalMicrounits()` must acquire `acquireTestAiUsageDateReservation()` from
`@voucha/test-helpers`, register `release()` with `onTestFinished` immediately, and use its returned
center day. The helper owns a clean three-day UUIDv7 window and uses independent advisory-lock slots
so parallel tests remain concurrent. See the [parallel-safety reference](../../reference-tests-parallel-safety-and-test-root-hygiene.md).

### Result-set overflow

Ranked/trending queries return `LIMIT 100` results. After enough runs, accumulated data pushes new test entities out of the top 100.

- **Use high scores.** Give test entities vote counts or tag counts large enough (100+) to land in the top results regardless of accumulated noise.
- **Use `minScore` / `min_score` filters.** Scope queries so only high-scoring entities appear.
- **Use `q` / text search filters.** When an endpoint supports text search, filter by a unique random string embedded in the test entity's title or markdown.

```ts
// Bad — score 3 gets buried after many runs
const { postId } = await createTrendingPostData({ votesScoreUp: 3 })
const result = await getTrendingPosts({ timeRange: 'day', limit: 100 })

// Good — high score + minScore filter isolates test data
const { postId } = await createTrendingPostData({ votesScoreUp: 500 })
const result = await getTrendingPosts({ timeRange: 'day', limit: 100, minScore: 100 })
```

### UUID-keyset sweep reads

A recovery sweep paged by UUID returns the whole database's lowest IDs first, so a test asserting on
its own row from page one fails once enough rows accumulate, and a negative assertion passes
vacuously. Read the owned row through the production keyset instead: `encodeUuidCursorBefore(id)`
from `@voucha/test-helpers/modules/pagination/uuid-cursors` builds an `after` cursor whose first
page starts at `id`. `readTestPendingCopyrightAgentDispatches(id)` from
`@voucha/test-helpers/services/copyright-notices/pending-agent-dispatches` applies it to the
copyright agent-dispatch sweep, so `toEqual([])` proves the owned record is not pending.
`readTestOwnedCopyrightSweepIds(searchPage, id)` from
`@voucha/test-helpers/services/copyright-notices/sweep-ids` does the same for any copyright
reconcile page function that returns a `CopyrightSweepIdPage`; wrap a page function that takes `now`
or `channel` as `options => searchPage({ ...options, now })`.

Delivery claims compare their 15-minute lease with the database's `CURRENT_TIMESTAMP`, so a test
cannot advance the clock past it. `expireTestCopyrightDeliveryIntentClaim(id, attempts)` from
`@voucha/test-helpers/data-stores/psql/copyright-delivery-claims` ages one owned claimed row's lease
and sets its attempt count, so a test can assert the sweep lists it and the next claim reclaims or
fails it. It covers case deliveries and replies to declined email intakes alike, because both are
rows of `copyright_notice_delivery_intents`.

`declineTestCopyrightEmailIntake()` and `bounceTestCopyrightEmailIntakeReply(intentId)` from
`@voucha/test-helpers/services/copyright-notices/declined-email-intake` create a parsed intake and
decline it through the real service, and send then bounce its reply. They return the intake and
intent ids that a test of the reply outbox needs.

### Embedding collisions

Default `Array(1536).fill(0.1)` embeddings are identical across all test entities. After enough runs, hundreds share the same embedding, making cosine-similarity results unpredictable.

- Use **random unit vectors** (`makeRandomEmbedding()`) so each test run's entities are orthogonal to prior runs'.
- When a test asserts a fixture ranks in ANN (`<=>`-ordered) results for a query vector, give **each fixture row its own `makeNearbyEmbedding(queryVector)`** — never store one identical vector on many rows. HNSW links duplicate vectors to each other at distance 0, forming a cluster whose graph reachability can fail and drop every fixture from results at once (issue #6781).
- For behavior tests that call `getCachedSearchEmbedding()`, seed the real Valkey cache first with `seedSearchEmbeddingCache(query, makeRandomEmbedding())`; reserve live Bedrock calls for the direct [embedding smoke test](../../../../backend/services/bedrock-embeddings/single/__tests__/index.bedrock.test.mts).
- Pass custom embeddings via the `embedding` option in `addDummyEmbeddingToPost` / `addDummyEmbeddingToRssFeedItem`.
- HNSW is approximate even with good fixtures, so `vitest.setup.data-stores.mts` raises the test database's `hnsw.ef_search` to `TEST_HNSW_EF_SEARCH` (see `vector-search-recall.mts`), making ANN scans effectively exhaustive at test-database scale.

### Hardcoded identifiers

Aliases, slugs, page IDs, hostnames, and titles that are the same on every run collide with rows from prior runs, causing uniqueness violations or false duplicate detection.

- **Randomize everything** with `Date.now()`, `Math.random().toString(36)`, or `crypto.randomUUID()`.
- **Duplicate-detection tests need random base fields.** If a test intentionally creates duplicate titles, slugs, aliases, or hostnames, generate one random base per test and derive every duplicate candidate from it.

```ts
const suffix = createRandomString(10)
const title = `Duplicate Topic ${suffix}`
const slug = `duplicate-topic-${suffix}`
```

### Cleanup retention windows

Cleanup tests must not assert exact global deletion counts from a dirty DB. Scope cleanup runs to a test-owned time window with `createTestRetentionWindow()`, pass the helper's `now` and `lowerBoundDate` to the cleanup function, and assert the specific fixture IDs that should survive or be deleted.

```ts
const window = createTestRetentionWindow()
await softDeleteUserAt(oldUser.id, window.firstEligibleDate)
await softDeleteUserAt(recentUser.id, window.afterUpperBoundDate)

await cleanupSoftDeletedUsers(window)

expect(await getTestUserRaw(oldUser.id)).toBeNull()
expect(await getTestUserRaw(recentUser.id)).not.toBeNull()
```

For tables with an explicit `expires_at`, use `createTestExpiryWindow()`. Its `now` equals its
`upperBoundDate`, unlike the retention helper whose `now` includes the retention-period offset.
Register exact fixture teardown with `onTestFinished` immediately after IDs are owned; Bluesky
link tests can use `deleteTestBlueskyLinkFixtures({ authorizationIds })` for FK-safe cleanup.

### Moderation transparency rollups

Global moderation-transparency assertions are the narrow exception to the no-shared-row-cleanup
rule. Released rollups are immutable and monthly readers combine every source cohort, so tests that
write those projections must use `acquireTestModerationTransparencyDateReservation()` and release
it with `onTestFinished`. The helper serializes the global projection family and exclusively owns
the recyclable 2006-12 through 2009-12 rollup window; no other test may use that date range. It
cleans only pending and released aggregate rows in that window, never source fixtures.

The reservation only isolates that fixed window, so it only applies to a test that backdates its
rollup writes through an explicit `occurredAt` parameter (e.g. `insertTestPostClearanceChange`). A
test exercising a production path that stamps real `now()` with no `occurredAt` of its own (its
rollup day comes from a UUIDv7 minted inside the trigger) cannot use the reservation — the row would
land outside the scrub window and leak permanently into the shared database. Assert on rows the test
owns instead: the stamped `moderation_transparency_community_id` on its own source row (NULL ⇒
global), or day-free counts scoped to a freshly created community via
`getTestCommunityModerationTransparencyRollupCounts()`. The community-scoped rollup row such a test
leaves behind on today's date is an intentional, harmless orphan: it is keyed by that test's own
freshly created community, so it never collides with another test's assertions and needs no cleanup.

### Oldest-first queue heads

Oldest-first queues such as the copyright staff queue (`GET /api/v1/copyright-notices/review-queue`)
return the whole database's backlog first, and that backlog only grows. A test that reads the queue
head sees other tests' rows, so its own row falls off the first page once enough older rows pile up,
and any other test's unreadable row fails the request. Seek to the test's own rows instead:
`readCopyrightStaffQueueCursorBefore(noticeIds)` from
`@voucha/test-helpers/data-stores/psql/copyright-notice-reads` returns an `after` cursor positioned
just before the first-queued of the given notices by `(urgency, waiting_since, id)`, so every page
starts at rows the test created. `readCopyrightStaffQueueCursorRows(noticeIds)` returns those
notices' queue keys in queue order. Because urgency tiers sort ahead of wait time, a test that mixes
deadline tiers seeks from its most urgent notice. Global urgency ordering, where another fixture's
missed deadline would change the result, runs in the isolated `copyright-staff-queue-urgency` case.
`@voucha/test-helpers/data-stores/psql/copyright-staff-queue` records a form intake review and adds
an open due or missed counter-notice deadline for those cases.
The staff email intake queue (`GET /api/v1/copyright-email-intakes/review-queue`) applies the same
keyset ordering, but its global query cannot prove fixture ownership from an `after` cursor alone.
Its exact global pagination cases run against fresh disposable databases through
`test-helpers/vitest-isolated-database-case.mts`; shared-DB calls to this cataloged operation are
rejected by the test guard. The reply-failure listing runs in the isolated
`copyright-staff-email-intake-reply-failures` case for the same reason, and so does the check that a
legal-process intake leaves the queue (`copyright-email-legal-process-queue`). For notification push intent recovery, pass the test's owned
`notificationIds` on every page, including pages with an `after` cursor. A cursor only advances
ordering; it does not exclude another fixture's eligible row.

### "No more results" assumptions

Don't assume `limit: 1000` returns all rows — the DB may contain more than 1000. Either use a filter or test `page_info` structure without assuming exhaustive results.

### Persistent dominant fixtures

A future-dated (or max UUIDv7) timestamp, or a score too high to ever decay out, produces a fixture that never leaves a `hot`/trending top-N result — a decaying high-score fixture (see "Result-set overflow" above) eventually retires itself, but a non-decaying one poisons every later run in this shared, dirty database until it's explicitly removed.

- Build non-decaying fixtures through `withDominantPostFixtures(specs, run)` in `entities/trending-posts.mts`. It owns each generated post ID before creation, passes the callback a frozen readonly snapshot while retaining the private ownership list, and always deletes every owned post after the operation settles — even if creation or the callback throws — so callback mutation cannot redirect cleanup and cleanup survives a failing assertion.
- The same ownership-scoped-cleanup principle applies to rate-limit test state: never call instance
  or static `RateLimiter.invalidate()` (it wipes every concurrent fork's counters for the whole
  prefix). Prefer a fresh identity that needs no cleanup. A fixed-identity test must derive exact
  owned keys through the production key builder and delete only those keys; route tests use
  `createRouteRateLimitKeyCleanup()` from
  `backend/services/route-rate-limits/test-support.mts` to register ownership before writes,
  guarantee `afterEach` cleanup, and retain failed scopes for a final retry.

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
```

See [Parallel-Safety and Test-Root Hygiene § Persistent dominant fixtures require deterministic cleanup](../../reference-tests-parallel-safety-and-test-root-hygiene.md#persistent-dominant-fixtures-require-deterministic-cleanup) and [Parallel-Safety and Test-Root Hygiene § Rate-limiter cleanup must be ownership-scoped, never prefix-wide](../../reference-tests-parallel-safety-and-test-root-hygiene.md#rate-limiter-cleanup-must-be-ownership-scoped-never-prefix-wide).

### Fixture states a concurrent sweep can act on

A whole-database recovery sweep locks and acts on other tests' rows too, so tests never call one.
They read the owned row through the sweep's keyset page (see
[UUID-keyset sweep reads](#uuid-keyset-sweep-reads)) and call the per-item function on it. Still
seed any multi-step state a sweep would act on in one transaction, so no concurrent sweep sees the
intermediate commit. Seeding a rejected form review by a live moderator, then erasing the moderator
in a second statement, once let a parallel sweep lock the review and wait on the moderator row the
erasure held, which deadlocked (#518). `createTestCopyrightFormRejectionByErasedModerator()` commits
both together.

Hard-deleting a post cascades into its relation rows, while a live vote-stats or publication worker
locks the post's publication scope, then the relation row, then FK-checks the post row.
`hardDeleteTestPost()` and `hardDeleteTestPosts()` therefore take the same `post:<id>` scope lock
first, in their own transaction, so the delete queues behind that worker instead of cycling with it.
Do not replace them with a raw `DELETE FROM posts`.

### Shared membership catalog rows

Only four `membership_products` rows are ever active — `plan ∈ {plus, pro} × interval ∈ {monthly, yearly}`, enforced by a partial unique index and pre-seeded by migration. `createTestSku()` upserts on `(plan, billing_interval) WHERE retired_at IS NULL`, so every caller with the same plan+interval gets the identical row. That row is shared, not owned — do not isolate by `(plan, interval)`; the interval pool is small and easily exhausted.

Isolate instead by `provider_application_id`, which `createTestSku()` already defaults to a random `test-${randomUUID()}` value. The catalog read path (`fetchSkusForActivePlans`, `getSkuByStripePriceIdCached`) picks the _latest_ provider mapping per product scoped to `(environment, application_id)`, so a unique application id makes a test's mapping unaddressable by anyone else.

When `createTestMembership()` creates its own SKU, it reuses that SKU's provider environment and
application id for its lineage. When a caller supplies `sku_id`, it must pair the SKU's provider
context explicitly with `provider_application_id` (and `provider_environment` when needed).
`createMembership()` and `getMembershipProductIdForCreation()` likewise require a paired explicit
`providerApplicationId` for a non-default context:

- `createTestSku` / `createRetiredTestSku` — `provider_application_id`
- `createTestMembership` with supplied `sku_id` — `provider_application_id`
- `createMembership` (and `getMembershipProductIdForCreation`) — `providerApplicationId`

A SKU under a unique application id paired with a lineage under `'voucha-web'` makes the `view_memberships` LATERAL join miss and silently turns the membership's price `null` (or, for `getMembershipProductIdForCreation`'s retained-product lookup, throws `InvalidMembershipGrantSkuError` because the lineage row it searches for was never written under that application id).

Catalog reads and reconciliation, manageable-subscription lookup, and Stripe membership sync
accept explicit contexts, so their tests use unique application identifiers. Fixed-default route
tests exercise their admission or serialization boundary through the route's existing internal
catalog dependency seam with isolated fixture values; they must not write the shared
`stripe/production/voucha-web` catalog mapping. Production entrypoints use
`DEFAULT_STRIPE_CATALOG_CONTEXT` or `DEFAULT_STRIPE_MEMBERSHIP_APPLICATION_CONTEXT`.

When auditing catalog isolation, inspect application identifiers threaded through local constants as
well as literal `provider_application_id` values, and distinguish read-only default-context fixtures
from calls that create or retire provider mappings.

`createTestSku` unconditionally invalidates the `activePlans` cache prefix on every call, suite-wide, regardless of application id — no test may assert that cache key is _present_; only key-specific prefixes (e.g. `byStripePriceId`) are safe to assert on.

## Related

- GlideMQ testing examples: [GlideMQ testing](glide-mq-testing.md)
- [Backend Vitest test authoring skill](../../../../.agents/skills/backend-vitest-test-authoring/SKILL.md)
- Agent conventions: [AGENTS.md](../../../../backend/test-helpers/AGENTS.md)
- Backend context and test conventions: [../AGENTS.md](../../../../backend/AGENTS.md)
- Mocking policy: [../services/AGENTS.md](../../../../backend/services/AGENTS.md)
- PostgreSQL (entity helpers align with schema): [../data-stores/psql/README.md](../../postgresql/README.md)
