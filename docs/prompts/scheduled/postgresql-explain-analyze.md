Review PostgreSQL query plans. Pick at most one concrete, bounded improvement that is safe to ship in one PR.

Load `postgres-node-performance-tuning`, `postgresql-rules`, and `vouchington-postgres`. Read [R3](../../development/postgres-schema-rules.md#r3--normalize-ids-are-fk-columns-json-is-for-schemaless-data) and [R6](../../development/postgres-schema-rules.md#r6--query-shape) of the schema rules.

## Capture the plans

Run the same steps as `.github/workflows/explain-analyze.yml` (custom and generic prepared plans). If the database is not initialized, run `./dev/initialize backend`, and pass the isolated `DATABASE_URL` and `VALKEY_URL` inline to each command (the workflow shows its synthetic CI values). Then, in order:

- `export EXPLAIN_SEED_ANCHOR_DATE=$(date -u +%Y-%m-%d)`
- `node backend/scripts/seeds/dev-seed.mts`
- `pnpm run explain:seed`
- `EXPLAIN_PLAN_CACHE_MODE=compare pnpm run explain:run`
- `pnpm run explain:analyze`
- `node backend/scripts/explain-analyze/pruning/run.mts` (proves pruning on explicit partitions, writes `pruning-proof-*.json`)
- `pnpm run explain:dump`

If PostgreSQL cannot run here, download the `explain-analyze-results` artifact from the newest `main` run of the Nightly workflow (`nightly.yml`), whatever its conclusion, and review `results-*.json` (kept 1 day; a failed run leaves only per-shard `explain-analyze-results-<shard>` artifacts, and `pruning-proof-*.json` only when present). If neither works, report `Outcome: incomplete`.

If a plan-shape gate fails, read the `results-*.json` in `backend/scripts/explain-analyze/output/` before the thrown message: `collectAndGate()` in `run-support.mts` records each result before gating it.

## Choose the work

Take the first that applies:

1. A failing gate, a new resource-pressure fingerprint, or a scenario that throws.
2. The worst plan by the red flags below, ranked by work per row returned, not warning count.
3. One hot read with no scenario: add the scenario, its seed rows, and a `registerScenarioContract` budget.

## Plan red flags

- A scan reading far more rows than returned: (actual rows + `Rows Removed by Filter` + `Rows Removed by Index Recheck`) × loops, as `processedRows()` in `backend/scripts/explain-analyze/plan-nodes.mts` computes, plus `Rows Removed by Join Filter` on joins.
- A SubPlan or correlated subquery whose loops equal the outer row count.
- A predicate under `Filter` where an `Index Cond` was expected, or a partitioned parent whose children all execute (count children with `Actual Loops` above 0, as `pruning/plan-gate.mts` does; `Subplans Removed` shows only plan-time pruning). A volatile function in the predicate causes both.
- A function call `fn_x(id)` in a `Filter` or output list: the planner did not inline it. Count calls with `SET LOCAL track_functions = 'all'` in a transaction and `pg_stat_xact_user_functions`.
- A join condition comparing text columns of two tables (a unique-string lookup of one row is fine).
- A generic plan much worse than the custom plan, a sequential scan on a large table, or an estimate off by 10x or more on a join-deciding node.

## Fixes

- Implement one safe query, index, extended-statistics, seed, scenario, or analyzer improvement that keeps the query's results. An index needs no approval; show the plan before and after. Gate every statistics change and budget change on measured before/after numbers recorded in the PR.
- For composite keyset pagination, the WHERE tuple must match the ORDER BY tuple and direction, and the plan must use the expected composite index (name it in the PR notes).
- When a table's indexes changed, re-trace every consumer.

Schema-growth and partition classification audits run from [postgresql-schema-growth.md](postgresql-schema-growth.md).
