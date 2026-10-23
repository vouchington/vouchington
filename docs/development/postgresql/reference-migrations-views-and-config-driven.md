# Migrations, Views, and Config-Driven

[Back to PostgreSQL Data Store](README.md#contents)

[migrate.mts](../../../backend/data-stores/psql/migrate.mts) applies three buckets of schema objects.

- `migrations/` holds the canonical fixed schema, run once per fresh database and tracked in a
  ledger. Edit the owning creator in place before launch and rebuild disposable databases; never
  add a forward `ALTER TABLE ADD COLUMN` because an earlier app version had another shape. Indexes
  live in their table creator, in the same transaction as the ledger insert.
- `config-driven/` holds seeds and generators (entity relations, vote tables, partitions) that
  replay on every bootstrap, so everything in it must be idempotent and convergent. A seed
  `ON CONFLICT DO UPDATE` must not accumulate (`col = col + 1`) or assign a bare volatile value.
- `views/` holds managed views, replayed on every bootstrap. A forced rebuild drops only managed
  views with `RESTRICT`, never `CASCADE`, so an unmanaged dependent blocks the rebuild instead of
  being silently removed.

Refreshed materialized-view contracts run in native CI preflights against the migrated database.
They exercise real PostgreSQL refreshes together with their HTTP, service, and queue consumers;
the database unit suite keeps DML and non-DDL validation checks. This preserves snapshot behavior
without introducing schema mutation into shared unit fixtures. A failed snapshot contract is a
projection or eligibility failure to diagnose, not a reason to reset unit resources.

See [prelaunch relational storage](../postgres-schema-rules.md#prelaunch-relational-storage).

## Manual DEFAULT range splits and receipt retirement

The PostgreSQL admin **Create Partitions** action accepts an explicit UUIDv7 interval for a
registered DEFAULT range table. A populated DEFAULT is split in one transaction under relation
locks; the operator sets a row admission limit and can choose smaller intervals when that limit is
exceeded. The scheduled monthly partition maintenance remains for tables that use it and does not
create ranges for DEFAULT-only tables.

Retiring an explicit `ai_agent_call_receipts` range uses
[`retireReceiptRange`](../../../backend/data-stores/psql/migration-runner/retire-receipt-range.mts)
after the owner verifies the intended partition name. This helper rejects in-flight calls, deletes
dependent report judgements within its admission limit, then detaches and drops the partition in
one transaction. PostgreSQL partition DROP does not invoke row-level foreign-key cascades; an
unrecognized reference blocks the transaction and leaves the range intact. Retained paid-operation
keys survive retirement and continue to reject a duplicate paid dispatch without authorizing
replay of the deleted ciphertext.

Other DEFAULT range families use the internal
[`retireExplicitRange`](../../../backend/data-stores/psql/migration-runner/retire-explicit-range.mts)
transaction only through a family-specific operator entry point. That entry point must verify its
own retention clock, child rows and external objects while the named relations are locked; the
common transaction then drops dependent ranges before their parent. A generic retirement action
is not exposed to the admin UI.

## View composition and the eligibility-view pull-up rule

PostgreSQL pulls a view up into the enclosing query, turning a per-row correlated re-scan into an
indexed lookup, only when the view's own query is a flat `SELECT` with no top-level `WITH` and no
plain `UNION` (`UNION ALL` is fine). A view that fails this is materialized as its own unindexed
subplan wherever it is joined, and any query reading it once per output row pays that cost per row.
Even one read with no key restriction derives every row, so cost grows with the table. Callers
therefore read a `view_*` only by its key, after picking ids from indexed base tables, as
[R6](../postgres-schema-rules.md#r6--query-shape) requires.

- Internal existence probes may use nested `MATERIALIZED` CTEs as optimizer fences; keep the parent
  correlation inside each CTE and the outer view flat.
- The rule applies at every nesting level. A view, or a scalar subquery in a view's target list,
  that reads another non-materialized view through a correlated `EXISTS (... UNION ALL ...)` still
  re-derives the whole eligible set per outer row. Candidate-bind instead: derive candidate ids from
  an indexed relation in a subselect, `UNION ALL` the sources, then join the candidates to the base
  table and the eligibility view in one join scope. Use the shared builders in
  [`@modules/feed-query-builders`](../../overview/architecture/backend/README.md)
  rather than hand-writing the shape; `count__discussions` in
  [`2025-01-19-topic-metrics.sql`](../../../backend/data-stores/psql/views/2025-01-19-topic-metrics.sql)
  is the worked example.
- An `EXISTS` over an eligibility view inside an `OR` can be planned as an uncorrelated hashed
  SubPlan that derives the view for every row. A scalar subquery with `LIMIT 1` is never hashed, so
  the outer id drives the lookup.
- Do not `LEFT JOIN view_users_public` inside another view; use scalar subqueries to
  `view_embedded_users`, which avoids seven OAuth joins and keeps single-row planning cheap.

## Staging Schema Drift (Pre-launch Only)

Pre-launch staging data is disposable; canonical schema edits require an operator-controlled
rebuild, not config-driven repair generators. Two checks catch drift:

- **Checksum mismatch**: each ledger row records a SHA-256 of the migration SQL. A file edited in
  place after a database applied it fails the run before any SQL executes, instead of being
  skipped or re-applied. A ledger row with no checksum also fails; recreate that database.
- **Post-migration schema verification** compares the live catalog with the committed snapshot
  after the run. It cannot roll back, but stops the deploy from reporting success on a schema it
  cannot verify. Neither check repairs automatically.

The snapshot includes column ordinal positions, so refine an unpublished migration by preserving
`CREATE TABLE` column order and validate against a complete fresh migration; an incrementally
patched development database can match while a fresh install does not.

**Extension versions are excluded from verification.** Managed Postgres, Homebrew, and CI images
each install whatever extension version they bundle (Aurora capped pgvector below the version CI
used, which failed every staging migrate). Presence still participates. Do not pin
`CREATE EXTENSION ... VERSION`: it only works when the version matches that install's base script,
so a pin that satisfies Aurora breaks other environments.

Staging reset is the "Staging database reset" step in the private `vouchington-infra` runbook, which requires organization access; it is a manual operator procedure, coordinated
with the [media-delivery reset and restore runbook](../../runbooks/media-delivery-reset-restore.md).
Production has not launched; follow [One current contract](../../../AGENTS.md).

`db:seed` is local development only and exits non-zero in production or staging. Staging gets a few
real RSS feeds from a config-driven generator so its crawl pipeline has data after each reset.
