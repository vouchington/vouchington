# Test Helpers

Testing utility library for the Voucha backend. See [CLAUDE.md](CLAUDE.md) for agent conventions and rules.

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

## `readEnqueuedJob` / `isDeduplicatedEnqueue` / `getEnqueuedJobId`

Read an enqueued job back by id (`backend/test-helpers/queue-jobs.mts`) instead of scanning
`queue.getJobs('waiting')`. `backend-data-stores` runs `isolate: false`: if any worker is attached to
a queue in the fork, the in-memory shim blocks `add()` until the job reaches a terminal state, so
`waiting` is deterministically empty the moment a worker exists — see
[Parallel-Safety § Live GlideMQ workers must not leak across isolate:false files](../../docs/development/reference-tests-parallel-safety-and-test-root-hygiene.md#live-glidemq-workers-must-not-leak-across-isolatefalse-files).

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
draining the job. More GlideMQ testing patterns: [examples.glide-mq-testing.md](examples.glide-mq-testing.md).

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

## Notification Push Recovery Backlogs

Use `withTestNotificationPushRecoveryBacklog()` from
`@voucha/test-helpers/notification-push-recovery` for a fixed recovery snapshot spanning multiple
pages. It pins owned intent timestamps to one isolated cursor window, exposes a frozen ordered ID
snapshot and endpoint-state readers, and deletes only its owned notifications after the callback
settles.

## Surviving a Dirty Database

The DB accumulates rows from every test run and is never cleaned. These patterns prevent flaky tests.

### Exact global AI-usage aggregates

Randomized IDs isolate fixture ownership, but they cannot isolate a query that sums every
`ai_usage_records` row in a day. Tests making exact assertions through
`getDailyAiCostTotalMicrounits()` must acquire `acquireTestAiUsageDateReservation()` from
`@voucha/test-helpers`, register `release()` with `onTestFinished` immediately, and use its returned
center day. The helper owns a clean three-day UUIDv7 window and uses independent advisory-lock slots
so parallel tests remain concurrent. See the [parallel-safety reference](../../docs/development/reference-tests-parallel-safety-and-test-root-hygiene.md).

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

### Embedding collisions

Default `Array(1536).fill(0.1)` embeddings are identical across all test entities. After enough runs, hundreds share the same embedding, making cosine-similarity results unpredictable.

- Use **random unit vectors** (`makeRandomEmbedding()`) so each test run's entities are orthogonal to prior runs'.
- When a test asserts a fixture ranks in ANN (`<=>`-ordered) results for a query vector, give **each fixture row its own `makeNearbyEmbedding(queryVector)`** — never store one identical vector on many rows. HNSW links duplicate vectors to each other at distance 0, forming a cluster whose graph reachability can fail and drop every fixture from results at once (issue #6781).
- For behavior tests that call `getCachedSearchEmbedding()`, seed the real Valkey cache first with `seedSearchEmbeddingCache(query, makeRandomEmbedding())`; reserve live Bedrock calls for the direct [embedding smoke test](../services/bedrock-embeddings/single/__tests__/index.bedrock.test.mts).
- Pass custom embeddings via the `embedding` option in `addDummyEmbeddingToPost` / `addDummyEmbeddingToRssFeedItem`.
- HNSW is approximate even with good fixtures, so `vitest.setup.data-stores.mts` raises the test database's `hnsw.ef_search` to `TEST_HNSW_EF_SEARCH` (see `vector-search-recall.mts`), making ANN scans effectively exhaustive at test-database scale.
- Semantic post-search tests that must isolate a known fixture set should pass `queryPosts: queryPostSemanticFixturesScopedToIds(ids)` into `toolsSearchPostsSemantic`. That helper wraps the production query in a `MATERIALIZED` CTE over `public.posts` for those IDs (max 32). Do not add a candidate-ID filter to production search.

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
just before the oldest of the given notices, so every page starts at rows the test created.

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

See [Parallel-Safety and Test-Root Hygiene § Persistent dominant fixtures require deterministic cleanup](../../docs/development/reference-tests-parallel-safety-and-test-root-hygiene.md#persistent-dominant-fixtures-require-deterministic-cleanup) and [Parallel-Safety and Test-Root Hygiene § Rate-limiter cleanup must be ownership-scoped, never prefix-wide](../../docs/development/reference-tests-parallel-safety-and-test-root-hygiene.md#rate-limiter-cleanup-must-be-ownership-scoped-never-prefix-wide).

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

- GlideMQ testing examples: [examples.glide-mq-testing.md](examples.glide-mq-testing.md)
- [Backend Vitest test authoring skill](../../.agents/skills/backend-vitest-test-authoring/SKILL.md)
- Agent conventions: [CLAUDE.md](CLAUDE.md)
- Backend context and test conventions: [../CLAUDE.md](../CLAUDE.md)
- Mocking policy: [../services/CLAUDE.md](../services/CLAUDE.md)
- PostgreSQL (entity helpers align with schema): [../data-stores/psql/README.md](../data-stores/psql/README.md)
