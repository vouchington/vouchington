Audit one table's growth class and partition classification. Make at most one evidence-backed
change.

Voucha has not launched, so no table has real growth yet. A seeded database holds fixed fixtures:
its row counts and `pg_stat_*` counters describe fixture loading, not growth. Never cite them as
growth evidence. The evidence is the code that writes and deletes the table's rows, and the plans the
EXPLAIN harness captures at seed scale.

For plans, capture them with the steps in [postgresql-explain-analyze.md](postgresql-explain-analyze.md#capture-the-plans),
or use the `explain-analyze-results` artifact from the newest `main` run of the Nightly workflow
(`nightly.yml`), whatever that run's conclusion. If neither works, report `Outcome: incomplete`.

- Read the full growth and identity projection in [schema-growth-test-policies.mts](../../../backend/test-helpers/schema-growth-test-policies.mts), its canonical [bounded and static identity policies](../../../backend/test-helpers/schema-growth-bounded-policies.mts), and the [partitioning strategy](../../overview/architecture/partitioning-strategy.md). Runtime partition and unbounded-table policies remain in [schema-growth-registry.mts](../../../backend/data-stores/psql/schema-growth-registry.mts). Pick the one projected registry entry whose `growth` class or partition eligibility is most likely to be stale.
- Compare that entry's `growth` class, `partition` policy, `noPartitionRationale`, and `reconsiderPartitioningWhen` against the evidence:
  - which writers create its rows, and how many per user action, crawl, or fan-out;
  - whether a retention job actually deletes them (`cleanupPartitions` or a data-retention job);
  - the plan shapes its readers show in the captured plans.
- Apply `$postgres-partitioning-uuid-v7`: RANGE on the UUIDv7 key, a DEFAULT child first, explicit range children only after about one million rows or measured planner/write pressure, and monthly children only where `cleanupPartitions` owns retention.
- Do not create partitions mechanically. A proposed partition needs planner or write pressure shown in the captured plans, a migration that is independently safe against the live schema, and resolved retention behavior. Without all three, leave the schema alone. Only correct the registry rationale or its reconsideration trigger when the code shows the recorded one is wrong.
- A justified registry, schema, or documentation change from this audit is that run's one improvement. If the audit supports no safe change, report a verified no-op without opening a PR.
