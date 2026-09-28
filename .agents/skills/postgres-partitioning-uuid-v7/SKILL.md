---
name: postgres-partitioning-uuid-v7
description: Apply reusable UUIDv7 partitioning guidance with Vouchington schema, migration, and pruning policy.
---

# Vouchington UUIDv7 Partitioning Adapter

## Canonical skill (required)

Claude Code and Codex load `vouchington-database:postgres-partitioning-uuid-v7`; Grok, Cursor, and OpenCode read
`node_modules/vouchington-tooling/skills/postgres-partitioning-uuid-v7/SKILL.md`. If the canonical skill cannot be read, stop and report the missing prerequisite; never apply this overlay alone.

## Vouchington additions

Read [`backend/data-stores/psql/AGENTS.md`](../../../backend/data-stores/psql/AGENTS.md), the
applicable migration history, and the project
[partition-pruning hints](../../../docs/overview/architecture/partition-pruning-hints.md).

- Keep `created_at` only when it carries business meaning or is required by an external contract;
  use UUIDv7 bounds for identifier-time windows and pruning.
- Every partitioned primary or unique key includes the partition key. Foreign keys, joins, and
  lookup indexes must preserve the same ownership and pruning relationship.
- Create future partitions before writers need them. Keep default-partition exclusion, row moves,
  attachment validation, retention, rollback, and pruning as partition lifecycle safety.
- Do not apply an expand/contract rollout to independently deployed application readers and writers.
  This app is unlaunched: change the canonical partition creator and the current producers and
  consumers together. See [One current contract](../../../AGENTS.md).
- Queries against a partitioned table constrain its partition key directly. When a join should
  prune both sides, supply equivalent bounds to both sides and verify the actual plan.
