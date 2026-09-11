# PostgreSQL Schema Quality Rules

Defect classes surfaced by SQL review that are easy to reintroduce. These are authoritative agent
rules; the terse pointer lives in [backend/data-stores/psql/CLAUDE.md](../../backend/data-stores/psql/CLAUDE.md).
Each rule links the tracking issue for its static-analysis guard / fix.

## Index every foreign key with a referential-integrity-usable leading index

PostgreSQL does **not** auto-index FK columns. An unindexed FK makes every parent `DELETE` — and
every `ON DELETE RESTRICT` existence check — sequential-scan the child table.

- The FK column must be the **leading** column of some index. A composite index led by a different
  column does not serve the RI probe.
- Predicate matters: a partial index `WHERE <fkcol> IS NOT NULL` **is** RI-usable (the probe value is
  concrete/non-null). A partial index `WHERE deleted_at IS NULL` is **not** — cascades and RESTRICT
  checks touch soft-deleted children too, so the planner can't use it and falls back to a seq-scan.
- `ON DELETE SET NULL` audit columns (`*_by_id → users`) are the systemic exception: index only the
  ones on large tables (posts, conversations, topics, communities); accept the rest.

Tracked by #7355 (FK supporting-index + indexing the offenders). Enforced by
`postgres-fk-index` in [`.no-mistakes.yml`](../../.no-mistakes.yml) with
`allowDirective: fk-index-guard-allow`. SET NULL audit-column exemptions live in `allowedColumns`.

Named `ALTER TABLE … ADD CONSTRAINT … NOT VALID` statements must have a matching
`VALIDATE CONSTRAINT`, enforced by `postgres-constraint-validate`.
`postgres-require-named-constraints` requires added foreign keys and checks to have explicit names,
and `postgres-require-fk-on-delete` requires explicit deletion behavior. no-mistakes recovers `NOT VALID` adds inside `DO $$` `IF NOT EXISTS` wrappers
so they pair with top-level `VALIDATE CONSTRAINT`.

`postgres-no-add-column` requires new columns to be folded into the original pre-launch
`CREATE TABLE`. The small set of repairs for schemas that were already deployed is declared as
exact path/table/column/type/nullability/default tuples in [`.no-mistakes.yml`](../../.no-mistakes.yml);
the rule rejects both mismatched operations and stale exceptions.

## No strict-prefix-redundant indexes

An index whose column list is a strict prefix of another index on the same table **with the same
partial predicate** is pure write/storage overhead — keep only the longer one. (Different opclasses,
different predicates, or a different sort-column position are **not** redundant.)

A `UNIQUE` prefix index (or one backing a primary/unique constraint) is **not** redundant unless the
longer index enforces the same uniqueness on the prefix columns — dropping it would remove a
data-integrity constraint, not just an access path. Only non-unique prefix indexes are drop candidates.

Tracked by #7356 (redundant-index guard + drops).

## Scope expensive `GENERATED … STORED` columns to their inputs

A generated column recomputes on **every** `UPDATE`, regardless of which column changed. For a costly
expression — e.g. the `search_vector` tsvector built from many nested `REGEXP_REPLACE` passes — a row
updated for unrelated reasons (embeddings, language detection, moderation) rebuilds the whole vector.

Use a `BEFORE INSERT OR UPDATE OF <source_cols>` trigger writing a plain stored (still-indexable)
column so unrelated updates skip the recompute. Keep it a real stored column to preserve the GIN index.

Tracked by #7357.

## Store and compare denormalized score columns in one consistent float type

Never mix `REAL` storage with `DOUBLE PRECISION` compute and an `EPSILON` change-check. `REAL` is exact
only for integers ≤ 2^24; once a fractional weighted sum passes ~32k, `0.5·ULP > EPSILON`, so the
change-detector is permanently "changed" → every recompute rewrites the row and re-enqueues its cache
refresh, defeating the debounced/no-op path. Pick one type (`DOUBLE PRECISION` for weighted sums) and
use it for the column, the compute, and the comparison.

This generalizes the existing vote-score rule in [psql CLAUDE.md](../../backend/data-stores/psql/CLAUDE.md#querying-rules).
Tracked by #7354.

## Large aggregation recomputes read the replica and absorb lag asynchronously

When a recomputed tally/counter over a large or unbounded append-only table (e.g. vote-score
aggregation, `SET votes_score_up = <recomputed>`) is written back as an idempotent full
recompute, read the **replica**, not the primary — do not add primary-read load for bulk
aggregation. Handle replica lag by running the recompute asynchronously with throttle
deduplication, an ordering key, and a fixed delay through the full throttle window plus a
replica-lag safety margin. For election tallies, a five-second throttle and one-second margin yield
a six-second delay; see the [elections queue timing](../../backend/queues/elections/README.md).
A full recompute written back from a replica must carry a freshness marker captured by the exact
aggregate statement. Election tallies persist the PostgreSQL snapshot `xmax` plus its in-progress
transaction count and accept only a later marker, so out-of-order jobs cannot roll a newer tally
back. A marker does not make residual replica lag self-healing: when the last scheduled recompute
reads before replication catches up, no later recompute is guaranteed (#11113). This remains a
deliberate eventual-consistency tradeoff.
Freshness-critical synchronous paths (e.g. `...FromPrimary` variants used for RSS discoverability)
may still read the primary directly.

Tracked by #7352.

## Derive `created_at` from the UUIDv7 `id`, never a wall-clock default

A table whose primary key is `id uuid PRIMARY KEY DEFAULT uuidv7()` already encodes its creation
time in the key. A separate `created_at timestamptz DEFAULT now()` (or `CURRENT_TIMESTAMP`) is a
second, independently-drifting source of the same fact — and any index sorting by it duplicates the
ordering the `id` already provides. Define `created_at` as
`GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL` (`STORED` only when it must be indexed),
and order/paginate by `id` rather than `created_at`.

Enforced statically by `static-code-analysis/repo-file-policy/uuidv7-created-at-ddl-guard.mts`, which
flags any UUIDv7-keyed `CREATE TABLE` whose `created_at` is not generated from the id. This is the
DDL-time complement to the runtime "query by `id`, not `created_at`" predicate guard.

DML that writes those generated `created_at` columns is enforced by
`postgres-no-generated-column-writes` in [`.no-mistakes.yml`](../../.no-mistakes.yml).
`no-mistakes` 0.46.1 peels `DO $tag$` bodies for pairing engines; `chr()`-encoded statements may still
be skipped. Election vote tables (`post_votes`, `topic_votes`, `hostname_votes`,
`rss_feed_item_votes`, `agent_moderation_votes`, `user_vouch_votes`, `entity_relation_votes`) are
created from TypeScript in `backend/data-stores/psql/config-driven/` rather than migration SQL, so
they stay in `extraGeneratedColumns`.

Tracked by #7359.

## Renaming a deployed index requires an explicit drop

An index renamed in generator/migration source (old name deleted, new name added) is not the same as
dropping it: a generator's per-index `DROP INDEX IF EXISTS <name>` only ever names indexes present in
_current_ source, so an already-migrated database keeps the old-named index forever — a duplicate
that costs write throughput and disk with nothing left to report it. `postgres-redundant-index` cannot
catch this: it only compares indexes that both exist **right now**, and the retired one no longer
does.

`check-index-renames.mts` (`pnpm run db:check-index-renames`, wired into `tests-postgres-schema.yml`)
closes this gap by comparing the committed schema snapshot at `git merge-base(<base>, HEAD)` against
HEAD: a retired index name whose _shape_ — the `pg_get_indexdef` text minus the name — reappears
under a new name on the same table is flagged as an unacknowledged rename unless this branch also
adds a migration with `DROP INDEX [CONCURRENTLY] IF EXISTS <old name>` (the same remediation
`backend/data-stores/psql/CLAUDE.md` already sanctions for deployed indexes), or the retired name is
added to `retired-index-allowlist.mts` for a genuine false positive (e.g. a PRIMARY KEY/UNIQUE
constraint reshuffle rendering as a rename with no drop of its own). See
[schema-snapshot/README.md § Cross-Revision Index-Rename Detection](../../backend/data-stores/psql/schema-snapshot/README.md#cross-revision-index-rename-detection)
for the full scope, including what it deliberately does not catch (a rename that also changes shape,
and orphans already live before this check existed).

Tracked by #8697.

## Related

- [backend/data-stores/psql/CLAUDE.md](../../backend/data-stores/psql/CLAUDE.md) — authoritative schema rules
- [Partitioning strategy](../overview/architecture/partitioning-strategy.md)
- [Schema Checks](reference-tests-schema-checks.md) — CI enforcement for the schema snapshot and index-rename checks
