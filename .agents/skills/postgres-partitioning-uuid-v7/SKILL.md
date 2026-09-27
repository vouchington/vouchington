---
name: postgres-partitioning-uuid-v7
description: Design Vouchington UUIDv7 partitions, schema changes, and pruning.
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
- Create future partitions before writers need them. Treat default-partition exclusion, row moves,
  attachment validation, retention, and rollback as one migration lifecycle.
- Queries against a partitioned table constrain its partition key directly. When a join should
  prune both sides, supply equivalent bounds to both sides and verify the actual plan.
- Follow [One current contract](../../../AGENTS.md) for partitioned schema changes.
