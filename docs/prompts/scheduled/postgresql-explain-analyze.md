Review PostgreSQL query plans. Pick at most one concrete, bounded improvement that is safe to ship in one PR.

Load `$postgres-node-performance-tuning`. Read [R3](../../development/postgres-schema-rules.md#r3--normalize-ids-are-fk-columns-json-is-for-schemaless-data)
and [R6](../../development/postgres-schema-rules.md#r6--query-shape) of the schema rules. Three of them
decide most plan fixes:

- Join on ids, never on text. Hashtags are the only exception.
- Read a `view_*` view only by its key, after choosing the ids from base tables.
- Never bound ids with `uuidv7(...)`; use `fn_min_uuidv7(...)`.

## Capture the plans

If the database is not initialized, run `./dev/initialize web`, then `source .env`. Capture custom
and generic prepared plans, as CI does:

- `pnpm run explain:seed`
- `EXPLAIN_PLAN_CACHE_MODE=compare pnpm run explain:run`
- `pnpm run explain:analyze`
- `pnpm run explain:dump`

If PostgreSQL cannot run in this session, download the `explain-analyze-results` artifact from the
newest successful `main` run of the backend workflow (it is kept for 1 day) and review its
`results-*.json`. If neither works, report `Outcome: incomplete`.

If a run fails a plan-shape gate, check the `results-*.json` artifact in
`backend/scripts/explain-analyze/output/` before the thrown error message. `collectAndGate()` in
`run-support.mts` pushes each scenario's captured result before gating it, so the failing plan is in
the artifact even when the gate rejects it.

## Choose the work

Take the first of these that applies:

1. A failing gate, a new resource-pressure fingerprint, or a scenario that throws.
2. The worst plan by the red flags below. `explain:analyze` warns on most results, so rank plans by
   the work they do per row returned, not by their warning count.
3. One hot read with no scenario. Add the scenario, its seed rows, and a `registerScenarioContract`
   budget.

## Plan red flags

- A node reads far more rows than the query returns. Count actual rows times loops, plus
  `Rows Removed by Filter` and `Rows Removed by Join Filter`, against the final row count. A view
  filtered, sorted or paged on its own columns usually shows up this way.
- A SubPlan or correlated subquery whose loops equal the outer row count.
- A predicate under `Filter` where an `Index Cond` was expected, or a partitioned parent whose
  children all execute (no `Subplans Removed`). A volatile function in the predicate causes both.
- A function call such as `fn_x(id)` in a `Filter` or an output list. The planner did not inline it,
  so the plan does not show its per-row work. To count its calls, run the query in a transaction
  after `SET LOCAL track_functions = 'all'`, then read `pg_stat_xact_user_functions` before
  rolling back.
- A join or index condition that compares text columns.
- A generic plan much worse than the custom plan for the same query.
- A sequential scan on a large table, or an estimate off by 10x or more on a node that decides a
  join.

## Fixes

- Implement one safe query, index, extended-statistics (`CREATE STATISTICS`), seed, scenario, or
  analyzer improvement. The fix must keep the query's results.
- An index needs no approval. Show the plan before and after it.
- For extended statistics, match the kind to the predicate shape and gate every stat-object change
  on measured before/after evidence — see
  [extended statistics](../../../.agents/skills/postgres-node-performance-tuning/SKILL.md#extended-statistics-create-statistics).
- For composite keyset pagination, verify the WHERE tuple matches the ORDER BY tuple and direction.
  For example, `(created_at, object_id) < (...)` must line up with
  `ORDER BY created_at DESC, object_id DESC`.
- For each composite keyset query, confirm the plan uses the expected composite index for the
  filtered table rather than a sequential scan. Name the expected index in the PR notes when a query
  depends on one.
- When a table's indexes changed, confirm every consumer was re-traced per the
  [Query → Index Impact recipe](../../../.agents/skills/postgres-node-performance-tuning/SKILL.md#query--index-impact)
  rather than assuming the reshaped index is a drop-in replacement.
- A budget change records the measured numbers before and after in the PR.

Schema-growth and partition classification audits run from
[postgresql-schema-growth.md](postgresql-schema-growth.md).
