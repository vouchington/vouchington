# PostgreSQL

- Load the [vouchington-postgres skill](../../../.agents/skills/vouchington-postgres/SKILL.md) for queries, transactions, locks, views, and indexes. This file holds schema and migration rules.
- Use [PostgreSQL docs](../../../docs/development/postgresql/README.md), [schema quality rules](../../../docs/development/postgres-schema-rules.md), and [schema object buckets](../../../docs/development/postgresql/reference-migrations-views-and-config-driven.md).
- Apply [R1–R7](../../../docs/development/postgres-schema-rules.md#r1--names-explain-the-stored-thing-in-full-words).
- Keep creators idempotent where possible and SQL lintable with `pnpm run squawk`. Hardcoded UUIDs are UUIDv7 (version nibble `7`).
- Apply the [prelaunch schema policy](../../../docs/development/postgres-schema-rules.md#prelaunch-relational-storage) and [staging drift rules](../../../docs/development/postgresql/reference-migrations-views-and-config-driven.md#staging-schema-drift-pre-launch-only).
- Never add `ALTER TABLE ADD COLUMN` or `DROP TABLE` migrations. Fold columns into their original creator; cross-file FKs use `ALTER TABLE ADD CONSTRAINT`.
- Every FK declares `ON DELETE`; cross-file FK/check constraints use `NOT VALID` then `VALIDATE CONSTRAINT`. Fixed migrations and ledger inserts are transactional; never add manual `BEGIN`/`COMMIT` or online index-upgrade migrations.
- Vote schema uses [`election-schema-config.mts`](config-driven/utils/election-schema-config.mts).
- After SQL changes, push the PR head, then follow [snapshot generation](../../../docs/development/postgresql/schema-snapshot/README.md) and fetch CI’s generated commit.
- Follow [relational storage](../../../docs/development/postgres-schema-rules.md#prelaunch-relational-storage) and [R3](../../../docs/development/postgres-schema-rules.md#r3--normalize-ids-are-fk-columns-json-is-for-schemaless-data).
- Prefer lifecycle timestamps over booleans/status columns. Non-terminal moderation/toggle state uses append-only `lifted_at` history (canonical `community_bans`), never mutable parent state; `moderation-history-guard.mts` enforces it.
- Keep final results on the owning row; follow [current state and history](../../../docs/development/postgres-schema-rules.md#r4--one-shape-per-concept).
- Follow UUIDv7 partitioning [strategy](../../../docs/overview/architecture/partitioning-strategy.md) and [pruning](../../../docs/overview/architecture/partition-pruning-hints.md). No HASH partitions.
