# Schema Snapshot

This directory generates a committed, human-readable snapshot of the PostgreSQL schema —
`schema.json` and the focused `markdown/` document tree — from `pg_catalog`/`information_schema` introspection. The snapshot
exists because the schema is assembled from three sources (`../migrations`, `../config-driven`, and
`../views`) and `pg_dump`/`psql \d` output is unusable as a diffable artifact: it enumerates every
partition child individually (24+ partitioned parents × many children) and is not byte-stable across
runs. `db:snapshot:check` fails CI when the live schema no longer matches the committed snapshot, so
every DDL-affecting change must regenerate and commit the snapshot alongside it.

## Update Flow

- Push the migration, config-driven SQL, or view change to an open same-repository PR. Its head
  must contain the current base branch tip, including for a stacked PR.
- Request generation by commenting `/postgresql-snapshot-update` on the PR, running
  `pnpm run db:snapshot:update` from its pushed head, running
  `pnpm run db:snapshot:update -- --pr <number>` for an explicit PR, or manually dispatching
  `postgresql-snapshot-update.yml` from `main` with `pr_number`. With no number, the command infers
  the current branch's open pull request in the repository `gh repo view` resolves. The command only
  dispatches CI; it does not read or change the worktree database.
- The workflow migrates a fresh PostgreSQL 18 service from the exact PR head and commits only
  `schema.json` and generated `markdown/` files to that head. An unchanged snapshot creates no
  commit. Fetch the publisher commit before further local work or rebasing.
- Ordinary PR CI then migrates its own fresh database and checks the committed snapshot with
  `generate.mts --check`. Local `pnpm run db:snapshot:check` continues to check the configured
  worktree database after clean migration.

**PG18 parity matters.** `pg_get_constraintdef`, `pg_get_indexdef`, `pg_get_viewdef`, and
`pg_get_functiondef` deparse output can shift wording across major PostgreSQL versions. Generate the
committed snapshot against the digest-pinned PostgreSQL 18 image in
`tests-postgres-schema.yml`; the workflow reads the candidate PR's image pin, so an image update
and its generated extension versions move together.

## Architecture

- Generation engines live in `@vouchington/postgres/pg-schema-snapshot`. This directory keeps the
  committed artifacts (`schema.json`, `markdown/`), the live `read()` catalog adapter, and the
  `PARTITION_POLICIES` / `UNBOUNDED_UNPARTITIONED_TABLES` growth maps.
- `catalog-query.mts` / `catalog-queries.mts` — wrap platform catalog SQL with `@data-stores/psql`
  `read()`. `readSchemaCatalog()` is the live adapter; individual readers stay in
  `@vouchington/postgres/pg-schema-snapshot`. Queries still exclude partition children and
  extension-owned objects, and never select table data. Catalog output is covered by
  `db:snapshot:check`.
- `types.mts` — re-exports `SchemaCatalog` and the versioned (`formatVersion: 2`)
  `SchemaSnapshot` type tree from the platform runtime.
- `build-snapshot.mts` — `buildSchemaSnapshot(catalog)` injects this repo's growth maps into the
  platform engine. Fully unit-tested (`__tests__/build-snapshot.*.test.mts`).
- `render-markdown.mts` — re-exports the platform runtime's `renderSchemaMarkdown`. Fully unit-tested
  (`__tests__/render-markdown.*.test.mts`). Partition children are never enumerated.
- `__tests__/` — split-by-topic unit test files for `build-snapshot.mts` and `render-markdown.mts`
  live here rather than colocated, matching this package's convention elsewhere (e.g.
  `../__tests__/index.*.generated.test.mts`); `no-mistakes`'s `vitest-test-correspondence` rule
  only resolves a topic-suffixed `<stem>.<topic>.test.mts` back to its `<stem>.mts` source when the
  test lives in a `__tests__/` directory. `generate.test.mts` stays colocated since its name is an
  exact match for `generate.mts` (no suffix, no `__tests__/` needed).
- `generate.mts` — the live schema generator used by the snapshot workflow and the `--check` CLI.
  Exports
  `generateSchemaSnapshot({ check })` and `writeSchemaSnapshot({ snapshot, markdown, check, root })`
  for unit testing against a temp directory; the direct-execution guard at the bottom only runs when
  invoked as a script. It detects missing, changed, legacy, and orphaned generated Markdown files;
  update mode removes only legacy `schema.md` and proven orphans in `markdown/`. Before comparing or
  writing, generated files are passed through oxfmt's `format()` API so committed bytes match
  `oxfmt --check`.

Local development databases can be rebuilt with `db:clean`. Staging uses the private
infrastructure staging database reset runbook (the "Staging database reset" step of the
first-deploy checklist in the private `vouchington-infra` repository), which requires organization
access. Neither path resets Valkey, queues, object storage, analytics warehouse/event data, or
infrastructure state.

## Declared Partition Policy and Physical Catalog Facts

A table's `partition` field comes from the typed
[`PARTITION_POLICIES`](../schema-growth-registry.mts) registry — the same registry the rest of the
codebase treats as authoritative for partition strategy and growth classification — not from live
`pg_partitioned_table` introspection. The registry's `children` policy (e.g. `monthly` vs. `default`)
is a physical partition-creation policy that can change independently of the parent table's DDL, so
the full `PartitionPolicy` object is stored, not just the partition key. `buildSchemaSnapshot` throws
if a table has `relkind = 'p'` (physically partitioned) but no `PARTITION_POLICIES` entry — every
partitioned table must be classified in the registry.

V2 also records `relationKind` and `physicalPartition` directly from `pg_class` and
`pg_partitioned_table`. Those facts describe what PostgreSQL currently enforces (`strategy` and
`key`); they intentionally remain separate from the declared registry policy, whose child cadence,
retention owner, access class, and growth classification are application policy rather than catalog
facts.

## Determinism and Completeness

- **Deterministic**: catalog-only queries, no `SELECT` of table data, no environment- or
  date-derived content. Generating twice from the same PR revision and PostgreSQL image produces
  byte-identical output.
- **Complete**: every logical application-DDL dimension (table, column, constraint, index, trigger,
  enum, view, extension, function, RLS policy, and partition policy) is captured, so any schema
  change — down to a single `COMMENT ON COLUMN` or a function body edit with no signature change —
  moves the snapshot and is caught by `db:snapshot:check`. Physical partition implementation rows
  are excluded. A top-level application foreign key must never reference a child directly; the
  PostgreSQL schema test fails such a constraint instead of normalizing it away.

Per-column `generated`/`generatedExpression` are consumed beyond documentation: the config-driven
`ON CONFLICT DO UPDATE` guard reads every `GENERATED ... STORED` column's expression from the
committed snapshot to map each generated column back to its source columns, then rejects a
config-driven seed assignment that would recompute the generated value out from under the arbiter
on replay — `VIRTUAL` columns are excluded since they never persist a stale value. See
[Migrated to off-the-shelf tools § on-conflict-generated-arbiter.mts](../../../../static-code-analysis/README.md#migrated-to-off-the-shelf-tools).
A column's generation expression is therefore schema-affecting for that guard even when the column's
own type and nullability are unchanged.
