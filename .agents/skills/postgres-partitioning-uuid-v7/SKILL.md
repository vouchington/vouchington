---
name: postgres-partitioning-uuid-v7
description: Design Vouchington UUIDv7 partitions, schema changes, and pruning.
---

# Vouchington UUIDv7 Partitioning Adapter

## Canonical skill (required)

Claude Code, Codex, and Grok load the plugin skill `skills:postgres-partitioning-uuid-v7`. If it cannot be loaded, stop and report the missing prerequisite; never apply this adapter alone.

## Vouchington additions

Read [`backend/data-stores/psql/AGENTS.md`](../../../backend/data-stores/psql/AGENTS.md), the
applicable migration history, and the project
[partition-pruning hints](../../../docs/overview/architecture/partition-pruning-hints.md).

- Keep `created_at` only when it carries business meaning or is required by an external contract;
  use UUIDv7 bounds for identifier-time windows and pruning.
- Every partitioned primary or unique key includes the partition key. Foreign keys, joins, and
  lookup indexes must preserve the same ownership and pruning relationship.
- Follow [partitioning strategy](../../../docs/overview/architecture/partitioning-strategy.md):
  `RANGE(id)` with a `DEFAULT` partition, split on demand, drops only through the guarded
  retirement path; do not partition short-lived rows deleted daily. Keep default-partition
  exclusion, row moves, attachment validation, rollback, and pruning as partition lifecycle safety.
- Do not apply an expand/contract rollout to independently deployed application readers and writers.
  This app is unlaunched: change the canonical partition creator and the current producers and
  consumers together. See [One current contract](../../../AGENTS.md).
- Queries against a partitioned table constrain its partition key directly. When a join should
  prune both sides, supply equivalent bounds to both sides and verify the actual plan.
