# EXPLAIN ANALYZE Framework

A development tool for profiling SQL query plans across key service queries.

## Usage

### 1. Seed test data

Inserts representative rows across core tables (users, topics, posts, rss_feeds, etc.). Seeded UUIDs
use the fixed `019e0000-` prefix for easy identification.

```bash
pnpm run explain:seed
```

### 2. Run EXPLAIN ANALYZE

Calls each service function, captures the SQL queries, and replays them with
`EXPLAIN (ANALYZE, BUFFERS, WAL, FORMAT JSON)`. Results are written to
`backend/scripts/explain-analyze/output/results-<timestamp>.json`.
The run fails if a scenario throws, captures no SQL, or cannot replay a captured query. Partial
results are still written so CI artifacts retain the plans captured before the failure.
The runtime manifest requires the exact scenario identities in `scenario-manifest.mts`, so replacing
a scenario cannot satisfy the ratchet merely by preserving its count. Required plan-shape gates also
verify candidate-driven universal-topic search, projection-only RSS state reads, and index-ordered
relation listings. Analysis compares temp I/O, disk spills, multi-batch hashes, and excessive WAL
against the exact query/node/relation/kind fingerprints in `resource-pressure-baseline.mts`; a new
fingerprint fails even when the total warning count is unchanged. Set `EXPLAIN_JIT_MODE=on` to compare
JIT diagnostics; the default is `off`, matching application OLTP sessions.
Set `EXPLAIN_PLAN_CACHE_MODE=compare` to capture forced custom and generic prepared plans for every
query; CI uses this mode. Individual `auto`, `force_custom_plan`, and `force_generic_plan` modes are
also supported. Every capture also runs under a fixed `work_mem` (`EXPLAIN_WORK_MEM` in
`backend/data-stores/psql/explain-analyze.mts`) so a local run and CI reach the same
spill verdict — see `reference-explain-analyze-tooling.md`.

```bash
pnpm run explain:run
```

The topic- and post-metrics scenarios use full batch sizes of 100 and 200 IDs. Their plan gates
reject correlated metric SubPlans and source work above the normal seed's requested-ID ceilings in
both CI plan-cache modes.

### Isolated topic-metrics benchmark

Use the heavyweight benchmark only for before/after investigation, not as a CI timing gate:

```bash
./dev/benchmark-topic-metrics --label baseline
./dev/benchmark-topic-metrics --label candidate
```

The command refuses the main worktree and non-local PostgreSQL targets. It creates a fresh,
uniquely named sibling database, migrates and deterministically seeds more than one million
associations across all five topic count families, verifies a 100-topic result against
`view_topic_metrics`, and always drops only the database it created. Results in the ignored
`output/` directory include raw sequential and capped-burst timings, median and nearest-rank p95,
read-pool gauges, custom/generic EXPLAIN plans and effective rows, environment metadata, and exact
seed counts.

### 3. Analyze results

Reads the latest result file and prints:

- Summary table sorted by execution time
- Seq scan warnings on large tables
- Row estimate mismatch warnings (>10x)
- Costliest node per query
- New resource-pressure fingerprints relative to the checked-in baseline

```bash
pnpm run explain:analyze
```

### 4. Dump results for analysis

Prints the full SQL queries and execution plans in a text format suitable for piping to an LLM:

```bash
pnpm run explain:dump                          # print to stdout
pnpm run explain:dump | your-llm-cli -p "analyze the query plans for performance issues"  # replace 'your-llm-cli' with your actual tool
```

## How It Works

### Query capture

`maybeCaptureQuery()` in
[`backend/data-stores/psql/query-capture.mts`](../../data-stores/psql/query-capture.mts) records SQL
calls through the `onBeforeQuery` hook configured in
[`setup.mts`](../../data-stores/psql/setup.mts). The `enableQueryCapture()` /
`disableQueryCapture()` functions toggle capture globally. Captured queries include the SQL text and
bound parameter values.

### EXPLAIN replay

`explainAnalyze()` strips any leading annotation comment (e.g. `/* query-name */`), prepends
`EXPLAIN (ANALYZE, BUFFERS, WAL, FORMAT JSON)`, and runs the query against the read pool inside a
transaction that is always rolled back after the plan is captured. This keeps profiling safe for
captured write queries such as stats upserts.

### Query naming

Queries annotated with a leading block comment — e.g. `/* feeds/posts/get-ids */ SELECT ...` —
are named from that comment via `extractQueryName()`. Unannotated queries fall back to the label
passed to `runAndCapture()`.

## Output format

Each result file is a JSON array of `ExplainResult` objects:

```json
[
  {
    "name": "feeds/posts/get-ids",
    "query_text": "/* feeds/posts/get-ids */ SELECT ...",
    "plan": { ... },
    "execution_time_ms": 12.3,
    "planning_time_ms": 0.8,
    "timestamp": "2026-03-13T00:00:00.000Z"
  }
]
```

## JIT compilation

PostgreSQL auto-enables JIT when estimated cost exceeds `jit_above_cost` (default 100,000). Feed
queries with many CTEs, subqueries, and RANGE partition scans can generate 600+ plan nodes, causing
JIT compilation (especially optimization and emission phases) to vastly exceed actual query runtime.

To measure real execution time instead of compilation overhead, `explainAnalyze()` defaults to
`SET LOCAL jit = off` before executing `EXPLAIN (ANALYZE, BUFFERS, WAL, FORMAT JSON)`. Set
`EXPLAIN_JIT_MODE=on` for a diagnostic comparison. `SET LOCAL` limits either mode to the profiling
transaction and does not alter other sessions.

If you see unexpectedly high execution times in EXPLAIN ANALYZE output, check whether a `JIT`
section appears in the plan — the compilation time is separate from `Execution Time`.

## Heavy-follow scenarios

The seed script creates a "power user" (`seeduser1`, index 1) who follows:

- 1000 users (users 2–1001)
- 200 topics (topics 0–199)
- 200 RSS feeds (feeds 0–199)

These scenarios exercise feed queries under realistic heavy-follow conditions, revealing how
partition fan-out and CTE complexity scale with follow counts.

## Remote ActivityPub follower page gate

The seed creates 100,000 remote ActivityPub followers across 1,000 hostname-backed instance
directory records for the seeded user, plus 1,000 deterministic relations to distinct other seeded
users. That target spread gives generic prepared plans representative `object_id` statistics while
preserving the seeded user's 100,000-follower late-page evidence. The
`remote-follower-inbox-late-cursor` scenario places its strict cursor so exactly `500 + 1`
candidates remain, then asserts that full lookahead page through `listRemoteFollowerInboxPage`; its
required plan gate rejects an underfilled or oversized page and a relation sequential scan, requires
`idx_relation__remote_actor__follow__user__active_reverse` with the strict
`(object_id, subject_id)` cursor condition, caps the candidate page and any sort at 501 rows, and
rejects plans that scan more than 501 follower-relation, `remote_actors`, `topics`, or
`topics__fediverse_instances` rows. This preserves the bounded durable fan-out contract documented by the
[ActivityPub delivery queue](../../queues/activitypub-delivery/README.md).

## Covered service queries

[`scenario-manifest.mts`](scenario-manifest.mts) ratchet-enforces the set of scenario identities via
`assertScenarioManifest()`, so an identity cannot be dropped, duplicated, or silently swapped for
another. Those identities are the caller-supplied labels passed to `runAndCapture()`, not a binding
to the service function each scenario calls — the manifest establishes label-set completeness, not
function coverage. The profiled service functions themselves live in
[`run-scenarios/`](run-scenarios/); [`run.mts`](run.mts) is the definitive list of top-level
`run*Scenarios()` modules it awaits directly. Some `run-scenarios/` files are composed into
another module instead of awaited directly — e.g. `partition-pruning.mts` is imported by
`entities-and-communities.mts`, not by `run.mts`.

**Hot-path loaders** (`run-scenarios/hot-path-loaders.mts`):

These are the per-request batch/list loaders the three hottest read paths fan out to after their
primary id query — the feed (`GET /api/v1/feeds/posts/:feed_type`), post detail
(`GET /api/v1/posts/:idOrSlug`), and user profile (`GET /api/v1/users/:idOrSlug`) routes.

- `getPostsByAnyBatch` — feed post rows batch (`view_posts` by id batch)
- `getPublicUsersByAnyBatch` — feed shared-by users batch (`view_users_public` by id batch)
- `getElectionsByIdBatch(posts)` — post election tallies batch (feed + post detail)
- `getCommunitiesByIdBatch` — post communities batch (feed + post detail)
- `listProfileLinks` — author/profile links (post detail + user profile)
- `getUserProfileMetricsByAny` — per-profile metrics; fans out to `getUserMetricsRowByAny` and
  `countUserMemberCommunities` (the post-facet and bookmark-count sub-queries are already covered
  by the search and metrics scenarios)

**User search** (`run-scenarios/entities-and-communities.mts`): `searchUsers` / `searchAdminUsers` —
public and admin user search (prefix match and admin UUID lookup). The two admin scenario
identities (`search-admin-users`, `search-admin-users-uuid`) exist because admin search accepts
either a name prefix or an exact id — a second lookup path public search does not have. Admin search
also accepts an exact email address (a third `EXISTS` branch over `user_email_addresses` in
`searchAdminUsers`, `backend/services/users/search.mts`); that shape has no scenario here and is not
covered by the two documented identities above.

## CI

The `EXPLAIN ANALYZE` GitHub Actions workflow
([`.github/workflows/explain-analyze.yml`](../../../.github/workflows/explain-analyze.yml)) is
called by the `test-explain-analyze` job in
[`ci.yml`](../../../.github/workflows/ci.yml), gated by the `explain-analyze:` path filter in
[`ci-path-filters.yml`](../../../.github/ci-path-filters.yml). Each CI run uses its own PostgreSQL
instance, so there is no interference with other tests. Results are uploaded as workflow
artifacts — see the upload step in `explain-analyze.yml` for the current retention.

## Idempotency

The seed script is safe to re-run. All INSERTs use `ON CONFLICT DO NOTHING`, so running
`pnpm run explain:seed` multiple times will not create duplicate data or fail.

## Test isolation

In CI, each job gets a fresh PostgreSQL database — no cleanup is needed. Locally, run
`source .env && pnpm run db:clean && pnpm run db:migrate` to reset the database if needed.

The seed maintenance pass runs `ANALYZE` on each seeded table that contributes to captured plans,
including RSS feed-item join tables such as `rss_feed_item_sources`, so replayed feed queries use
fresh local planner statistics.

## Adding more queries

Add service calls through `runAndCapture()` and update `scenario-manifest.mts` with the new stable
scenario identity. The framework automatically captures and explains all SQL issued by those calls.
Only add a `resource-pressure-baseline.mts` entry after inspecting the exact plan and deciding the
specific pressure is intentional; do not baseline a query-wide warning count.

**Author entries against the identity CI actually emits, not a local one.** CI always runs
`EXPLAIN_PLAN_CACHE_MODE=compare`, which appends the plan-cache mode to the query name
(`<name>:force_custom_plan` / `<name>:force_generic_plan`) — and `getExplainResultIdentity`
(`analyze.mts`) also appends the mode as its own field, so CI never produces a `…|auto` identity. A
baseline entry keyed `…|<name>|auto` only ever matches a local default-mode run and is silently
inert in CI; a real entry needs **both** the `…|<name>:force_custom_plan|force_custom_plan` and
`…|<name>:force_generic_plan|force_generic_plan` keys. Copy the identity string out of a CI
artifact (`explain-analyze-results`) rather than guessing it from local output.

RSS feed search includes both direct topic filtering and
`rss-feed-search-by-topic-descendants`, which exercises `include_descendants=true` against seeded
`relation__topic__parent__topic` rows.
