Review PostgreSQL query plans. Pick exactly one concrete, bounded improvement that is safe to ship in one PR.

If the database is not initialized, run `./dev/initialize web`, then `source .env`. Seed the database and run the EXPLAIN ANALYZE scripts:

- `pnpm run explain:seed`
- `pnpm run explain:run`
- `pnpm run explain:analyze`
- `pnpm run explain:dump`

- Investigate performance issues and implement one safe query, index, extended-statistics (`CREATE STATISTICS`), seed, or analyzer improvement. For extended statistics, match the kind to the predicate shape and gate every stat-object change on measured before/after evidence — see [extended statistics](../../../.agents/skills/postgres-node-performance-tuning/SKILL.md#extended-statistics-create-statistics).
- Consider whether one missing query should be added to this script.
- Review SQL queries for performance issues, missing indexes, and plan regressions.
- For composite keyset pagination, verify the WHERE tuple matches the ORDER BY tuple and direction. For example, `(created_at, object_id) < (...)` must line up with `ORDER BY created_at DESC, object_id DESC`.
- For each composite keyset query, confirm the plan uses the expected composite index for the filtered table rather than a sequential scan. Name the expected index in the PR notes when a query depends on one.
- When a table's indexes changed, confirm every consumer was re-traced per the [Query → Index Impact recipe](../../../.agents/skills/postgres-node-performance-tuning/SKILL.md#query--index-impact) rather than assuming the reshaped index is a drop-in replacement.
- If a run fails a plan-shape gate, check the `results-*.json` artifact in `backend/scripts/explain-analyze/output/` before the thrown error message — `collectAndGate()` in `run-support.mts` pushes each scenario's captured result before gating it, so the failing plan is in the artifact even when the gate rejects it.

Schema growth and partition classification — audit at most one table per run:

- Read `backend/data-stores/psql/schema-growth-registry.mts` and the [partitioning strategy](../../overview/architecture/partitioning-strategy.md), then pick the one registry entry whose `growth` class or partition eligibility is most likely to be stale.
- Compare that entry's `growth` class, `partition` policy, `noPartitionRationale`, and `reconsiderPartitioningWhen` against measured evidence: current row count, the plan shapes captured by `explain:run`, write and autovacuum pressure, and whether retention actually deletes rows.
- Apply `$postgres-partitioning-uuid-v7`: RANGE on the UUIDv7 key, a DEFAULT child first, explicit range children only after about one million rows or measured planner/write pressure, and monthly children only where `cleanupPartitions` owns retention.
- Do not create partitions mechanically. A proposed partition needs measured evidence, a migration that is independently safe against the live schema, and resolved retention behavior. Without all three, leave the schema alone; only correct the registry rationale or its reconsideration trigger when the recorded one is demonstrably wrong.
- A justified registry, schema, or documentation change from this audit is that run's one improvement. Otherwise, recording no change is a valid result — say so in the PR notes and spend the run on the query-plan work above instead.
- The retention product decision tracked in issue #8750 is out of scope for this audit.
