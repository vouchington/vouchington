# EXPLAIN ANALYZE Framework

A development tool for profiling SQL query plans across key service queries.

## Usage

### 1. Seed test data

Inserts representative rows across core tables (users, topics, posts, rss_feeds, etc.). Seeded UUIDs
use the fixed `019e0000-` prefix for easy identification.

```bash
pnpm run explain:seed
```

The 100,000-post seed writes `output/seed-posts.jsonl` incrementally. Each batch and its INSERT,
clearance update, and final COMMIT have begin/end records with elapsed time. Transaction acquisition
is measured first; a begin record without an end record identifies the operation interrupted by the
[CI seed-step limit](../../../.github/workflows/explain-analyze.yml). The seed transaction's
PostgreSQL backend PID and effective settings are recorded after acquisition. A separate, bounded
observer connection periodically samples its `pg_stat_activity` wait, blockers, query age, and transaction age,
then records start/end `pg_stat_wal` and `pg_stat_checkpointer` counters with numeric deltas.
Observer errors appear in the same file and do not change the seed result. CI also saves
`output/seed-resources.txt`, with labeled host CPU, memory, and workspace disk samples and
PostgreSQL container stats and tmpfs usage. Both files are retained by the existing EXPLAIN results
artifact even when seeding fails.

On a freshly migrated database, the first post batch can leave the planner with empty-table
statistics while the [`fn_ensure_retained_post_identity` trigger](../../data-stores/psql/migrations/0000-00-01-retained-entity-identities.sql)
looks up each inserted identity. An exact-schema local reproduction found repeated sequential scans
of the growing retained-identity partition in that trigger. After the first completed batch, the
seed runs one timed `ANALYZE retained_post_identities, posts` inside its existing transaction. Plain
`ANALYZE` also refreshes their partitions; later batches can then plan against populated statistics.
This addresses the reproduced stale-plan path. The hosted clearance slowdown still needs its own
diagnostic evidence before assigning it the same cause.

### COPY for high-cardinality fixtures

Use COPY only when it improves a complete fixture load at its real cardinality. Compare fresh,
equivalent databases with the same PostgreSQL version and server settings (including `work_mem`),
and alternate candidate order to expose warm-cache effects. Measure input generation and CSV
encoding, staging and COPY, target writes, index/statistics work, and commit. Include surrounding
transactions: the remote-follower fixture also creates its instance directory. Compare logical
row fingerprints and rerun counts, not just elapsed time; a faster COPY transport alone is not a
loader win. The measured follow-up is [#1067](https://github.com/vouchington/vouchington/issues/1067).

For a measured winner, stream a bounded source into typed temporary staging with `ON COMMIT DROP`,
then use the normal ordered, idempotent SQL to merge into target tables in the same transaction.
Keep foreign keys, triggers, post-clearance history, and the first-batch post statistics refresh
active. A COPY or merge failure must roll back staging and target writes together. The
[embedding batch writer](../../services/bedrock-embeddings-batch/orchestrator/save.mts) shows the
transaction and `pg-copy-streams` pipeline; its generator iterates an already-materialized array,
so copying that utility does not make a large fixture source memory-bounded. Respect workspace
dependencies: do not import the unrelated embedding service or rely on its transitive COPY package.
Retain the full EXPLAIN corpus and custom/generic plan gates after any loader change.

Repeated fresh PostgreSQL 18.6 comparisons at CI's `work_mem=32MB` and `jit=off` did not find a
stable COPY win, so no loader was converted. These are local comparisons, not a hosted PostgreSQL
18.4 result.

The existing remote-follower loader took 7.647s for 100,000 actors, 101,000 follows, and 1,000
directory entries; bounded staged COPY took 10.690s. Earlier 4MB pairs also favored the existing
loader (9.68s vs 13.68s and 7.88s vs 9.40s).

The 20,000-user loader's one 32MB pair was 7.743s versus 6.766s with staged COPY. Confirmation pairs
did not repeat that gain: the existing loader took 6.128s and 14.253s, 500-row staged COPY took
6.426s and 6.610s, and 5,000-row staged COPY took 11.405s. Earlier 4MB user pairs were mixed
(6.11s vs 8.34s and 6.26s vs 6.03s). User fingerprints matched after initial loads and reruns.

The 100,000-post loader, including clearance history and the first-batch statistics refresh, took
17.470s, 19.197s, 20.722s, and 28.141s. Staged COPY with the same 500-row batches took 24.582s and
29.044s. A 5,000-row COPY batch took 27.773s. A 10,000-row COPY batch took 15.057s, 25.275s, and
30.972s. Every COPY run matched the existing loader's logical post and clearance fingerprints, and
reruns kept those counts and fingerprints. The single faster 10,000-row sample does not repeat.

Remote-follower, user, and post COPY candidates have no stable measured benefit.

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
RSS feed scenarios gate the materialized eligible cohort and one story-winner selection, and
bound effective item/source rows plus join-filter rejections, including loops and filtered or
rechecked scan rows. The budgets derive from the normal RSS seed sizes in
`seed-data/common.mts`; buffer totals and timing remain diagnostic evidence. Ordinary and heavy
follow scenarios share those budgets with a sparse source-topic filter and a text-filtered
high-cardinality story whose feed must return one canonical representative. The skew scenario
reuses the story-projection cohort with a dedicated search token rather than adding another
population. Ordinary, heavy-follow, and sparse scenarios capture the first and continuation pages
and reject repeated direct stories or delivery IDs across them. The skewed story is exhausted by
its single canonical delivery, so it asserts `has_next_page=false` instead of replaying an empty
continuation. Global RSS recency and semantic search keep their independent pagination gates.
Post-share scenarios seed sparse and dense repeated deliveries to old targets through
`seed-data/post-feed-shares.mts`, alongside disabled branches and a recipient with no shares.
Both chronological and hot scenarios capture first and continuation pages. Their gates require
the exact seeded distinct-target population, indexed post/root probes bounded by that population,
and zero target/root work for an empty share cohort. They also reject joins that multiply
eligible-target spool reads or join-filter rejections by delivery count. Disabled scenarios
must omit share relations and CTEs from the plan; SQL builder tests prove the corresponding
CTEs and union arm are absent from the generated query. Timing and buffers remain diagnostic.
Story-member scenarios reuse the 1,000-item story already seeded for the RSS story-skew and URL
projection cases. Preview limits 1 and 3 call `getStoryPreviews` with the real direct primary;
their continuations, and the default 25-item detail first/continuation pages, call the same
production member selector as GET `/api/v1/stories/:id`. Each page captures custom and generic
prepared plans. The gates require an indexed `story_id` membership scan, an `id <` index bound on
continuation, a full limit-plus-one lookahead, and physical member work bounded by that lookahead
plus one excluded primary on first previews.

The member selector evaluates discoverability and viewer exclusions in a correlated eligibility
probe before its `LIMIT`; the probe's `LIMIT 1` keeps PostgreSQL from reordering those exclusions
into a hash join and sorting the full remaining story on late continuations. Each selected page
calls the production hydrator after invalidating only its selected item and election cache keys, so
the actual item,
election, and embed SQL is captured even after a prior warm request. Scenario assertions require
those queries' bound item IDs and hydrated maps to match the selected page, excluding the actual
next-page lookahead item. Zero-row optional related-post lookups are retained as production behavior
but are not represented as positive EXPLAIN coverage. The plan gates reject broad RSS-item scans
and hydration row counts above the selected page size. The old 2,000-row selector plans in
`story-member-old-plans.json` are exact extracts from the paired prior route capture; gate tests
prove both old plan modes fail the new work ceiling. The central 1,000-member seed is a separate
dataset, so timings and buffers are diagnostic rather than a paired speedup measurement.
The verified OAuth-client scenario interleaves a small active verified subset through a larger
unverified population and uses a late keyset cursor with exactly 102 verified rows remaining.
Its pagination gate requires
`idx_oauth_clients__verified_active_id`, the late cursor as an index condition, and no
`oauth_clients` sequential scan or explicit sort in both plan-cache modes.

The `rss-feed-items-search-global-late-cursor` scenario uses the publication time and UUID of
`seed-item-guid-20000` as an exact scoped boundary in the normal RSS seed. It requires a full page
with lookahead. Its gate requires the composite cursor in the publication index condition and
caps physical RSS candidate work at the scenario page size plus lookahead, counting filtered and
rechecked rows with their loops without summing ancestor result rows. Both prepared plan modes
must pass; response-page timestamp formatting must preserve this index traversal.

Embedding reconciliation scenarios mark a sparse 100-item current-embedding cohort late in the
25,000-item RSS seed. The RSS recovery service scans it with an opaque keyset cursor and a no-op
queue boundary; its plan gate requires the pending partial index, an `id` index condition, `Limit`,
and at most 100 physical candidates without a sequential scan or sort. The first-community-post
scenario requires the existing `(created_by_id, community_id, id)` partial index for UUIDv7 order,
with no extra timestamp index. Both gates run for custom and generic prepared plans.

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
[`backend.yml`](../../../.github/workflows/backend.yml), gated by the `explain-analyze:` path filter in
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
