# EXPLAIN ANALYZE Framework

A development and CI tool that profiles SQL query plans for key service queries.
[Suite rule R4](../../tests.md#test-suite-rules) puts realistic data sizes, query plans, wall time,
heap, and pool checks here; unit tests cross the same boundary with the smallest fixture. Commands
are `pnpm run explain:seed`, `explain:run`, `explain:analyze`, `explain:coverage`, and
`explain:dump` (run `--help` or read the scripts for options). They use only the caller's
environment: initialize the backend first and pass its isolated `DATABASE_URL` and `VALKEY_URL`
inline, after running the dev seed (the copyright scenarios need its notice and target).

A small functional fixture cannot establish a selective large-table plan. Dispatch scenarios keep
realistic noise in this standalone runner while unit tests cross bounded page boundaries, so plan
regressions remain distinguishable from batching and cursor failures.
The manifest establishes representative plan evidence for named production selectors; it is not a
function-coverage inventory for every stage of a daily cleanup. Add a separate captured selector
and realistic eligible and ineligible rows when a stage has a distinct access path.

The seed phase needs headroom for hosted-runner variability and resource-sampler shutdown. When
seeding reaches its completion message at the deadline, inspect the phase timings before treating
the timeout as a query-plan failure or rerunning the job.

## How it works

- **Capture.** Service functions run under query capture, which records annotated SQL with bound
  parameters. Queries are named from the leading `/* name */` annotation.
- **Replay.** Each captured statement is replayed with `EXPLAIN (ANALYZE, BUFFERS, WAL, FORMAT
  JSON)` on the read pool inside a transaction that is always rolled back, so captured writes are
  safe to profile.
- **Application-like settings.** JIT is off (it is off in application OLTP sessions, and compilation
  time otherwise dwarfs execution on heavy feed queries; `EXPLAIN_JIT_MODE=on` is the diagnostic
  comparison). `work_mem` is pinned so a local run reaches the same disk-spill verdict as CI.
- **Custom and generic plans.** CI runs with `EXPLAIN_PLAN_CACHE_MODE=compare`, forcing both
  prepared-plan modes for every query, because production hits whichever the plan cache picks.
- **Function calls.** `track_functions` is read before and after the replay to count non-inlined
  user-function calls. Parallel workers keep separate counters, so scenarios with a
  `maxFunctionCalls` cap get a second serial replay for deterministic counts. Set a cap loose enough for small plan changes and tight enough to expose
  per-row call growth.

## Determinism

- The seed and the run are separate processes that re-derive seeded ids from a shared UTC anchor
  day (`EXPLAIN_SEED_ANCHOR_DATE`). CI picks it once in the seed job and passes it to every shard
  so a boundary between jobs cannot split ids; a red anchor check near a boundary is a real defect, not a reason to rerun.
- Ordinary seeded rows are never dated after the run. The anchor day is the latest day whose noon,
  plus the largest forward offset any seed helper adds, has already passed. Rows the database stamps
  itself (`uuidv7()` ids, `now()`) therefore sort after ordinary seeded rows; relation tables check
  `id > subject_id`, and a noon anchor on the run's own day failed that check before the latest
  seeded post timestamp had passed.
- While each scenario builds its query, `Date` is pinned to the anchor noon so time-range
  cutoffs sit at a fixed offset from seeded rows. Under the wall clock a one-week window held a
  different number of posts per hour, which flipped a plan between a seq scan and a bitmap scan.
  Fixture discovery must use the same clock: an initial lookup under wall time can age a fixture
  out of its visibility window before capture begins.
- Expiring fixtures whose selectors use a bounded business window also derive their expiry and
  cutoff from that anchor. A seed restored for a later runner must retain the same eligible page;
  otherwise elapsed wall time can move every seeded row below the selector's lower bound.
- Fixtures selected with PostgreSQL's wall clock refresh only their known active rows immediately
  before capture after an archived seed is restored. A pinned application clock cannot keep an
  expired SQL-clock row eligible.
- After bulk seeding, the seed runs `VACUUM (ANALYZE)` on declared seeded relations before the first
  plan capture, instead of depending on autovacuum timing, and refreshes statistics after the
  first post batch because a fresh database plans the retained-identity trigger against empty-table
  statistics.
- Materialized views are refreshed after that statistics pass. Refresh replaces the heap and leaves
  column statistics empty, so each view is analyzed again before capture. Without `window_name`
  statistics, equality uses default selectivity and the trending ranking index is planned as a
  small bitmap that reads the whole window.
- Seeding is idempotent (`ON CONFLICT DO NOTHING`); CI uses a fresh database per job.
- The partitioned comment-page fixture uses future ranges outside the ordinary seed and runs after
  ordinary captures so its large corpus cannot change their plans. Its owned partitions stay until
  the isolated database is discarded; deleting the corpus row by row would spend the profiling
  budget on foreign-key cleanup. Seed and run
  preflights reject a database that already contains these partitions. Recreate that disposable
  database through the [dev workflow](../../../../dev/AGENTS.md) before another full run.
- A fixture restored after a captured write needs fresh statistics for its participating relations
  before replay: bulk-seed statistics may no longer describe those rows. The hostname invalidation
  fixture owns this refresh so initial seeding and restoration use the same preparation.
- A latest-per-entity lookup (`WHERE fk = $1 ORDER BY id DESC LIMIT 1`) needs target entities that
  are a minority of their column, with many one-row entities beside them. With only a few
  entities the planner expects each filter hit within a few primary-key rows and its cost is close
  to the foreign-key index's, so the plan can flip to a backward primary-key walk that filters
  thousands of rows. Real tables are never that skewed, and the plan then flips by margins of
  50x rather than 1.5x.
- Bounded-claim fixtures need a ready backlog large enough to distinguish an ordered index page
  from scanning all eligible work. A small eligible queue can legitimately favor a bitmap scan
  and sort even with accurate statistics; that choice does not establish unbounded backlog work.
- Approval-page plans cover both recently written and vacuumed import requests. Visibility-map
  changes affect the cost of the covering recommendation index; the selector must keep its
  recommendation-scoped access path even when heap visits are required. A global pending-request
  scan can preserve ID order while reading unrelated recommendations, so ordering alone does not
  establish bounded work.

## Loader decisions

### Hacker News filter scale measurements

The final HN scale phase owns explicit monthly post partitions, after the ordinary and comment
fixtures. Its recorded query-decision clock makes one-year cutoffs prune real leaves without moving
the ordinary DEFAULT corpus. Future post identifiers still take the production hot-score future-date
guard because PostgreSQL's wall clock is unchanged; timing is diagnostic, while page membership,
candidate work and partition access are checked. A leftover-scale preflight requires recreating the
disposable database before another full run.

Sparse positives, zero matches and the unvoted-related-URL witness are separate fact states.
Current stored-flag queries retain the existing row-work budgets and run in both plan-cache modes,
including first and continuation pages. Historical canonical-URL join predicates are composed only
inside the measurement code, under current pagination and hot-window rules. Their plans are a
separate diagnostic artifact; they cannot add an exception or weaken a production plan gate.

The cold/warm labels concern PostgreSQL shared buffers. Before each cold replay, the administrator
evicts only non-shared current-database heaps and indexes named by that statement's plan and records
evicted, flushed and skipped buffers. Skipped buffers fail preparation. The owned post leaves disable autovacuum, because a running
autovacuum worker pins leaf buffers and makes eviction skip them; the explicit ANALYZE calls
supply their statistics. The historical URL join reads relations outside those leaves, so this
disposable database disables autovacuum there too and cancels a worker already vacuuming them.
A transient skip is retried; a buffer that stays pinned still fails preparation. A warm measurement follows
the same statement and plan mode immediately. OS and storage caches remain uncontrolled; neither
the ordinary repeat pass nor a WAL checkpoint establishes a cold read cache. This instrumentation
requires the disposable database's PostgreSQL administrator and the `pg_buffercache` extension;
it never restarts the server or clears global caches. Results, density witnesses, per-page row and
buffer work, and full historical plans live in the uploaded `hacker-news-scale.json` artifact.

COPY is adopted for a fixture only when it wins a complete load at real cardinality, compared on
fresh equivalent databases with alternating order and matching logical fingerprints. Repeated
comparisons for the remote-follower, user, and post loaders found no stable win, so none was
converted. Any loader change must retain the full corpus and both plan-cache gates.

## Gates

A scenario declares its plan contract next to its service call in `run-scenarios/`. The registry
validates scenario identities and expectation kinds, and fails if a registered scenario produced no
capture. The manifest ratchets the set of scenario identities so one cannot be dropped, duplicated,
or swapped; it proves label completeness, not function coverage.

A failing scenario or scenario group is recorded and the run continues, so one run lists every
failed scenario and run check before it exits non-zero. After a failure, the manifest check also
reports as missing each scenario that failed and each scenario that never ran because its group
stopped at a setup step.

- **Declarative contracts** cap processed rows (returned rows, filter removals, and index rechecks,
  times loops), require indexes, bind queries to the selected page, forbid correlated aggregates,
  and require single-leaf partition access. Budgets derive from measured work across both plan
  modes plus headroom. Timing and buffers stay diagnostic.
- **Topic viewer counts.** A dense topic fixture combines many zero-vote attachments for the
  requested topic with positive attachments elsewhere. It catches plans that scan global positive
  votes or hash the posts table to count a small candidate set. The positive topic expression
  indexes narrow physical relation reads and give the planner statistics for positive candidate
  lookup keys. Keep the query predicates aligned with those index expressions.
- **Universal checks.** An executing read of an unbounded partitioned parent must touch one leaf
  unless the scenario declares a cross-partition reason. An executing sequential scan on an unbounded
  relation above the seeded-row threshold fails, and a nonempty scan with no declared fixture count
  also fails, so new relations cannot bypass the check. Keep fixture counts current when changing
  seeds.
- **Sequential-scan baseline.** Fingerprints key each query and plan mode to its scanned large
  relations; partition children use the parent name so rollover is not a new fingerprint. Each
  scenario is captured twice, and a fingerprint missing from the baseline fails only if both
  captures show it. Between the captures, `ANALYZE` re-samples only the large relations the first
  capture scanned and the baselined relations it skipped, because only those can change the gate;
  re-analyzing every large relation a plan touched took most of the run. The captures share one database, so they cannot reveal a scan
  that is a coin flip across databases: each large scan is also planned with `enable_seqscan = off`,
  and when avoiding it costs at most a quarter more (`SEQ_SCAN_TIE_RATIO`) it is a near-tie and
  advisory. A baselined scan the planner drops is the same coin flip when the replacement's
  per-execution cost times its loops stays within that margin: Postgres prices a node for one
  loop, so a nested-loop index probe is not a fix merely because one execution is cheap. A missing
  index keeps the scan in the probe plan and a real regression costs far more, so both still fail.
- **Resource-pressure baseline** (temp I/O, spills, multi-batch hashes, excess WAL) is keyed by exact
  query/node/relation fingerprint, so a new fingerprint fails even if the warning total is
  unchanged. Excess WAL fails only when both captures show it: a checkpoint can add full page
  images to one capture without a plan change. A per-node WAL fingerprint and the query-wide
  aggregate are that same threshold, so pressure that moves between those two reports still fails.
  Temp spills and hash batches still fail from the first capture. Add an entry only after inspecting
  the plan and deciding the pressure is intentional.
- **CI identity gotcha.** CI always runs compare mode, so identities carry the plan mode suffix and
  a baseline key ending in `auto` is silently inert in CI. A real entry needs both the custom and
  generic keys; copy the identity from a CI artifact rather than local output.
- Materialized views cannot be explained through `REFRESH`, so their scenarios explain the defining
  query from `pg_get_viewdef`.

## Explicit-range pruning

The normal seed keeps the production default-only partition layout. A separate runner
(`pruning/run.mts`) builds an owned sibling database with explicit UUIDv7 ranges beside each
default partition and verifies, per plan mode, that point reads execute only their target leaf.
Real server controls (cleanup, rollback of a blocked retirement, and the migration runner) run in
that database; pure unit tests cover only emitted SQL and ordering, not server behavior. A
migration control must distinguish leaked sessions from unrelated server maintenance so that CI
detects real cleanup failures without rejecting healthy runs. Forced cleanup would hide the leak
the control is meant to detect.

The migration concurrency control uses a small owned migration fixture so its bounded process
does not repeat the full application bootstrap. The pruning runner separately applies the canonical
schema and verifies it before exercising explicit-range pruning.

## Coverage

`explain:coverage` compares annotated runtime SQL against captured query names and exact query text
using the `no-mistakes` executed-SQL extraction, and reports confirmed uncovered reads, ambiguous
same-name reads, and unclassified executions. Matching is exact: it never normalizes literals or
guesses placeholders. A raw client read of a session-local temporary table cannot be captured or
replayed because replay uses a different connection. The scheduled
[coverage prompt](../../../prompts/scheduled/postgresql-explain-coverage.md) uses the largest
user-facing gaps to choose one new scenario per run.

## Adding queries

Add service calls through `runAndCapture()` and register the new stable scenario identity in
`scenario-manifest.mts`; the framework captures and explains all SQL those calls issue.

## CI

The `EXPLAIN ANALYZE` workflow is called by `test-explain-analyze` in `backend.yml`, gated by the
`explain-analyze:` path filter. The `seed-explain` job seeds the corpus once, so a slow runner can
fail only one seed and the shards do not each pay for it. It then stops PostgreSQL cleanly and
archives the data directory, and each parallel shard starts its own PostgreSQL on a
copy. Plans depend on the seeded server's physical state as much as its rows: page counts, the
visibility map, index creation order (which breaks cost ties) and the statistics the seed collected
on only the relations it fills. A `pg_dump` restore rebuilds all of that and flipped near-tie plans,
so the shards never restore or re-analyze the corpus. The ordinary scenarios run in one fixed order
because earlier runners mutate the shared corpus; `explain-shards.mts` and
`run-ordered-scenarios.mts` cut that order into contiguous segments, one per ordinary shard. The
first segment (`main`) owns every manifest scenario no other shard declares; the later segments list
theirs in `explain-shard-scenario-ids.json`. A segment starts from the seeded corpus without the
writes of the segments before it, so open one only at a runner that reads none of what earlier
segments leave behind, and keep a runner with the predecessor whose writes its plan needs. A plan
that changes because a shard lost a predecessor's writes is fixed by regrouping, never by loosening
its contract. The partitioned comment fixture plus the pruning proof (`partition`) and the
million-post Hacker News fixture (`hn-scale`) are additive, so no other scenario reads them and each
has its own shard. The late fixture writers that must follow every ordinary plan close the last
ordinary segment. Size the segments from per-runner timings in a recent run so every shard job stays
within the CI runtime budget in [CI](../../ci.md). A scenario listed in no shard or in two fails the manifest checks. The
`explain-analyze-gates` job merges the shard artifacts, requires every manifest scenario once, and
enforces the plan gates, baselines and native coverage over the merged results. It uploads them as
`explain-analyze-results`; a failed shard leaves only its own `explain-analyze-results-<shard>`
artifact.

The seed step has a 30-second budget. Shrink fixtures or batch seed work to fit it; never raise the
budget to accommodate a larger fixture.

Unsharded `explain:run` runs everything in the original order. The seed records per-batch timing and
resource samples to the `explain-seed-diagnostics` artifact so a seed that hits the CI step limit
shows which operation was interrupted. The capture step leaves bounded headroom for fixture setup
and both plan modes; the enclosing job budget also reserves time for plan gates, pruning and
artifact publication. Diagnose scenario timings before changing a deadline.

The `backend-data-stores` Vitest owner verifies prepared-target custom and generic plans,
transaction-local settings, and rollback of an explained write against an owned user fixture.
These mechanism checks use the existing schema. To reproduce them locally, initialize an owned
PostgreSQL worktree with a role permitted to set `track_functions`, source its `.env`, and run
`pnpm exec vitest run --project backend-data-stores backend/data-stores/psql/explain-analyze.test.mts`.
Scale-dependent scan choices belong to the EXPLAIN workload plans, where the relevant data
distribution and indexes are present.
