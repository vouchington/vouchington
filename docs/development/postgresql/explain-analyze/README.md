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
  day (`EXPLAIN_SEED_ANCHOR_DATE`). CI exports it once per job so a UTC midnight between steps
  cannot split ids; a red anchor check near midnight is a real defect, not a reason to rerun.
- While each scenario builds its query, `Date` is pinned to the anchor day's noon so time-range
  cutoffs sit at a fixed offset from seeded rows. Under the wall clock a one-week window held a
  different number of posts per hour, which flipped a plan between a seq scan and a bitmap scan.
- After bulk seeding, the seed runs `VACUUM`/`ANALYZE` on the relations whose plans varied across
  fresh CI databases, instead of depending on autovacuum timing, and refreshes statistics after the
  first post batch because a fresh database plans the retained-identity trigger against empty-table
  statistics.
- Seeding is idempotent (`ON CONFLICT DO NOTHING`); CI uses a fresh database per job.

## Loader decisions

COPY is adopted for a fixture only when it wins a complete load at real cardinality, compared on
fresh equivalent databases with alternating order and matching logical fingerprints. Repeated
comparisons for the remote-follower, user, and post loaders found no stable win, so none was
converted. Any loader change must retain the full corpus and both plan-cache gates.

## Gates

A scenario declares its plan contract next to its service call in `run-scenarios/`. The registry
validates scenario identities and expectation kinds, and fails if a registered scenario produced no
capture. The manifest ratchets the set of scenario identities so one cannot be dropped, duplicated,
or swapped; it proves label completeness, not function coverage.

- **Declarative contracts** cap processed rows (returned rows, filter removals, and index rechecks,
  times loops), require indexes, bind queries to the selected page, forbid correlated aggregates,
  and require single-leaf partition access. Budgets derive from measured work across both plan
  modes plus headroom. Timing and buffers stay diagnostic.
- **Universal checks.** An executing read of an unbounded partitioned parent must touch one leaf
  unless the scenario declares a cross-partition reason. An executing sequential scan on an unbounded
  relation above the seeded-row threshold fails, and a nonempty scan with no declared fixture count
  also fails, so new relations cannot bypass the check. Keep fixture counts current when changing
  seeds.
- **Sequential-scan baseline.** Fingerprints key each query and plan mode to its scanned large
  relations; partition children use the parent name so rollover is not a new fingerprint. Each
  scenario is captured twice with `ANALYZE` between, and a fingerprint missing from the baseline
  fails only if both captures show it. The captures share one database, so they cannot reveal a scan
  that is a coin flip across databases: each large scan is also planned with `enable_seqscan = off`,
  and when avoiding it costs at most a quarter more (`SEQ_SCAN_TIE_RATIO`) it is a near-tie and
  advisory. A missing index keeps the scan in the probe plan and a real regression costs far more,
  so both still fail.
- **Resource-pressure baseline** (temp I/O, spills, multi-batch hashes, excess WAL) is keyed by exact
  query/node/relation fingerprint, so a new fingerprint fails even if the warning total is
  unchanged. Add an entry only after inspecting the plan and deciding the pressure is intentional.
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
migration control fails when a client backend or parallel worker remains after the child process
group is empty. It waits, inside the control's existing budget, for PostgreSQL to reap that
child's backend. Autovacuum and other non-client backends are not server clients, and a forced
drop is not a passing cleanup.

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
`explain-analyze:` path filter. Each run has its own PostgreSQL instance. The seed records
per-batch timing and resource samples to the results artifact so a seed that hits the CI step limit
shows which operation was interrupted.
