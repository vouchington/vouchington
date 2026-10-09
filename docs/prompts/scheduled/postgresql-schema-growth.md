Audit one table's growth class and partition classification. Make at most one evidence-backed
change.

If the database is not initialized, run `./dev/initialize web`, then `source .env`. Capture plans
with `pnpm run explain:seed` and `EXPLAIN_PLAN_CACHE_MODE=compare pnpm run explain:run`. This audit
needs a live database: row counts and `pg_stat_*` write and autovacuum data are not in the CI
EXPLAIN artifact. If PostgreSQL cannot run in this session, report `Outcome: incomplete`.

- Read the full growth and identity projection in [schema-growth-test-policies.mts](../../../backend/test-helpers/schema-growth-test-policies.mts), its canonical [bounded and static identity policies](../../../backend/test-helpers/schema-growth-bounded-policies.mts), and the [partitioning strategy](../../overview/architecture/partitioning-strategy.md). Runtime partition and unbounded-table policies remain in [schema-growth-registry.mts](../../../backend/data-stores/psql/schema-growth-registry.mts). Pick the one projected registry entry whose `growth` class or partition eligibility is most likely to be stale.
- Compare that entry's `growth` class, `partition` policy, `noPartitionRationale`, and `reconsiderPartitioningWhen` against measured evidence: current row count, the plan shapes captured by `explain:run`, write and autovacuum pressure, and whether retention actually deletes rows.
- Apply `$postgres-partitioning-uuid-v7`: RANGE on the UUIDv7 key, a DEFAULT child first, explicit range children only after about one million rows or measured planner/write pressure, and monthly children only where `cleanupPartitions` owns retention.
- Do not create partitions mechanically. A proposed partition needs measured evidence, a migration that is independently safe against the live schema, and resolved retention behavior. Without all three, leave the schema alone; only correct the registry rationale or its reconsideration trigger when the recorded one is demonstrably wrong.
- A justified registry, schema, or documentation change from this audit is that run's one improvement. If the audit supports no safe change, report a verified no-op without opening a PR.
