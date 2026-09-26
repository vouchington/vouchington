# Schema Rules

See [README.md](./README.md) for schema reference and the generated [schema snapshot index](schema-snapshot/markdown/README.md); this file covers agent rules for migrations, views, and SQL callsites. Quality rules (FK indexing, redundant indexes, STORED columns, score typing, replica writes) live in [postgres-schema-rules.md](../../../docs/development/postgres-schema-rules.md).

## Migration Rules

- Write migrations to be as idempotent as possible (`CREATE OR REPLACE`, `CREATE IF NOT EXISTS`). Keep new SQL lintable under `pnpm run squawk`.
- **All hardcoded UUID literals must be UUIDv7** (version nibble `7`).
- Edit migration files in place only for schema objects not yet applied anywhere, including staging. Marker, checksum, and recovery procedure: [Staging Schema Drift](reference-migrations-views-and-config-driven.md#staging-schema-drift-pre-launch-only). Already-deployed objects get a new migration.
- Migration files must not contain `ALTER TABLE ADD COLUMN` or `DROP TABLE`. Fold new columns into the original `CREATE TABLE`, or register an exact forward action in the `postgres-no-add-column` rule in [`.no-mistakes.yml`](../../../.no-mistakes.yml). Cross-file FKs use `ALTER TABLE ADD CONSTRAINT`.
- Every foreign key declares `ON DELETE`. Cross-file FK and check constraints use `NOT VALID` then `VALIDATE CONSTRAINT`.
- Fixed migrations run transactionally with their ledger insert. Do not add manual `BEGIN`/`COMMIT`. Concurrent indexes use `-- migration-mode: online`. See [README.md](./README.md#migrations-views-and-config-driven).
- Vote schema changes are config-driven via [`election-schema-config.mts`](config-driven/utils/election-schema-config.mts).
- After SQL changes, push the PR head, run `pnpm run db:snapshot:update` to request CI generation,
  and fetch its generated commit before continuing. See [schema-snapshot/README.md](schema-snapshot/README.md).

### Schema Change Placement

Choose among fixed migrations, config-driven objects, and managed views using [Schema Object Buckets](reference-migrations-views-and-config-driven.md#schema-object-buckets).

## Querying Rules

- Do not query by `created_at` for UUIDv7 `id` tables — query by `id`.
- Never read a non-materialized view _correlated to an outer row_ (a batched-by-id lookup, a scalar subquery inside another view's target list, an `EXISTS` keyed to an outer id) without a restriction reaching its driving relation, at any nesting level — an unfiltered correlated read forces the planner to re-derive the whole view once per outer row instead of an indexed lookup. This does not ban a once-per-query, uncorrelated full-view read (e.g. a platform-wide aggregate); that pays the view's cost once, not per row. See [View Composition and the Eligibility-View Pull-Up Rule](reference-migrations-views-and-config-driven.md#view-composition-and-the-eligibility-view-pull-up-rule).
- Load [postgres-node-performance-tuning](../../../.agents/skills/postgres-node-performance-tuning/SKILL.md) for set-based IO, replica selection, large datasets, and `psql.pipelineBatch` versus UNNEST. Index changes: follow its [Query → Index Impact recipe](../../../.agents/skills/postgres-node-performance-tuning/SKILL.md#query--index-impact).
- Every SQL query must start with a `/* functionName */` comment.
- No `OFFSET` — use cursor-based pagination (`@modules/pagination`).
- Use `pgvector.toSql()` for PostgreSQL vectors. Query parent tables, not partitions.
- **No polymorphic relationships** — per-entity FK columns plus `CHECK (num_nonnulls(...) = 1)`, never `entity_id` + `entity_type`. Canonical examples: `vote_integrity_flags`, `report_integrity_flags`.
- **Elections are not first-class entities.** They are vote tallies identified by their parent (`election.id === parent.id`). Reference the parent.
- Numeric filters on aggregates or `GENERATED … STORED` columns must match the SQL type; reuse [buildVoteScoreFilters](../../services/entity-relations/vote-score-filters.mts).
- Prefer timestamps over booleans. Avoid `status` columns — derive state from lifecycle timestamps.
- Non-terminal moderation/toggle state is an append-only history table (`lifted_at`), never a mutable parent column. Canonical: `community_bans`. Enforced by `moderation-history-guard.mts`. Details: [postgres-schema-rules.md](../../../docs/development/postgres-schema-rules.md).
- After relaxing a single-row assumption, re-audit that table's query sites for leftover `LIMIT 1`.
- Keep SAVEPOINT transaction-state probes on borrowed/caller-supplied clients; do not replace them with `client.getTransactionStatus()`. See [Transactions](reference-transactions.md).

## Partitioning Rules

Load [postgres-partitioning-uuid-v7](../../../.agents/skills/postgres-partitioning-uuid-v7/SKILL.md)
and follow the [partitioning strategy](../../../docs/overview/architecture/partitioning-strategy.md)
and [pruning hints](../../../docs/overview/architecture/partition-pruning-hints.md). HASH
partitioning is forbidden.

## See Also

- Backend context: [../../CLAUDE.md](../../CLAUDE.md)
- Schema reference: [README.md](./README.md)
- Schema quality rules: [postgres-schema-rules.md](../../../docs/development/postgres-schema-rules.md)
- Services: [../../services/CLAUDE.md](../../services/CLAUDE.md)
