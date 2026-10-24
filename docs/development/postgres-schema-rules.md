# PostgreSQL Schema Quality Rules

The reasons behind the schema rules, most of which `no-mistakes` postgres rules enforce. The terse
pointer lives in [backend/data-stores/psql/AGENTS.md](../../backend/data-stores/psql/AGENTS.md).

## Prelaunch relational storage

Voucha has not launched. Change the canonical schema creators and current callers together, then
rebuild disposable databases. Migrations still provide deterministic fresh installation, a ledger,
checksum verification, transactional execution, and current seeds/views. They are not a sequence of
upgrade deployments, so do not add backfills, dual writes, compatibility readers, or activation
stages for old application versions. Keep external protocols, security key rotation, and exact
replay envelopes where those contracts actually require them. Launch behavior and worktree-database
recovery follow [One current contract](../../AGENTS.md).

- An internal entity reference is a column or child row with a concrete foreign key and a
  supporting index, including a reference inside a primary or unique key. Extract such an id from a
  JSON document or UUID array and leave the rest of the document in JSON. Do not replace a document
  with a typed column per field.
- Structured documents and data points stay JSON. A data-point field that references an entity (a
  topic id) is a foreign-key column; counts, amounts, and the rest stay in the JSON.
- Change history stays JSON. Do not extract before/after values or add foreign keys for ids that
  appear only in a history document: history is for tracking and is never joined.
- Live references point at live tables. An entity that must stay referenceable after deletion has
  its own retained-identity row; durable rows that outlive the entity reference that row. A retained
  identity never authorizes a deleted entity, and root reservation does not prove the live entity
  exists. Cleanup removes an owner only after its live row and every durable reference are gone;
  each durable row has a retention owner, a window, and the requirement behind it. Indefinite
  retention requires a cited legal duty; retaining an identity does not extend the window of a row
  that references it.
- Model alternatives as per-entity FK columns with an exact-one-target constraint, or as typed
  child rows. Never use a UUID array, type/id pair, generic attribute/value table, or encoded string
  key as relationship storage.
- JSON that stays: structured application documents, change history, reviewed opaque provider
  documents, external protocol payloads, and replay envelopes. The
  [relational-storage catalog](../../static-code-analysis/repo-file-policy/relational-storage-catalog.mts)
  records reviewed exceptions; there is no debt inventory, and a stale entry must be removed. A UUID
  array has no exception.
- Two reviewed categories need no foreign key: opaque token/cursor/protocol identifiers with no owning
  row, and audit snapshot identifiers that must outlive their source and are never joined for
  authorization. Entering either needs plan review.

## R1 — Names explain the stored thing, in full words

- Tables are plural snake_case and read as `<owner>_<thing>s`; only the last word is plural.
- One-word table names are for core entities only (`users`, `posts`, `topics`, ...). Anything else
  names its owner and its thing.
- Base names use full words (a denylist bans known abbreviations; standard acronyms stay). If that
  exceeds 63 bytes, pick a shorter name made of full words.
- `__` in a table name is reserved for generated entity-relation tables. Subtype extensions (pk =
  the parent id) are `<subtype>_<parent>s`; a 1:N child stays `<parent>_<thing>s` so they can be
  told apart.

## R2 — Columns say their type and target

- `timestamptz` ends in `_at`; `date` is `day` or ends in `_on`; booleans read as a predicate
  (`is_`, `has_`, `can_`, `should_`). Names copied from an external payload get no exception,
  because the column is our own copy.
- Actor FKs to users are `<verb>_by_id`; other user FKs end `_user_id`. The suffixes are reserved:
  a `uuid` ending in either is always a FK to `users` (or its retained identity). Every other FK
  column ends in its target's singular last word.
- A column with a fixed value set is an enum or a lookup-table FK, never `text`. Use an enum when
  values are defined in code and change with a migration; a lookup table when rows carry attributes
  or values arrive at runtime. Values an outside system defines are stored by who sets them: a
  vendor we authenticate gets a lookup table filled on first sight (normalize, then
  `INSERT ... ON CONFLICT DO UPDATE ... RETURNING id`); values strangers set stay `text` with a
  reviewed entry, because a lookup table would let any sender create permanent rows.
- A column never names a table. A row that could belong to one of several tables goes in one table
  per target.
- Lifecycle timestamps are the facts; status is never stored beside them. Keep the timestamps and
  derive status as an enum-typed `STORED` generated column, so CHECKs shrink to ordering rules. A
  time-based state cannot be generated (immutable expressions only), so a sweeper writes the
  timestamp. A retry becomes an attempts-ledger row rather than rewinding the parent. Rows that keep
  returning to earlier states become history tables.

## R3 — Normalize: ids are FK columns, JSON is for schemaless data

- A reference is an FK column or FK child row, never a UUID array, a type/id pair, or an id inside
  JSON. The exception is a history document, which records ids as they were when written.
- **Join on ids, never on text.** An outside string (vendor id, edge or cache key, slug, email) is a
  unique or generated column, never a primary or foreign key. Turn it into an id once where it
  enters. Looking up outside input by its unique text is fine; joining tables on it is not.
  Hashtag text is the exception because the text is what is matched.
- A `uuid` column ending in `_id` belongs to a foreign key unless it is a cursor or high-water
  mark, a per-attempt fencing token, a kept-after-delete scope or audit id, an id living outside
  PostgreSQL, a pre-allocated id, or a natural key. Each exception has a reason in an allow entry.
- Relations and their votes have one table per relation, generated from metadata. Per-relation state
  is keyed by an enum generated from the same metadata; after launch a new relation adds its enum
  value in its own migration before anything uses it.

## R4 — One shape per concept

- Field-diff history (`_revisions`): who edited content, `revised_by_id` to users `SET NULL`,
  append-only.
- Typed lifecycle log (`_changes`): a ledger entry whose actor must survive account deletion, so
  `changed_by_id` references the retained user identity with `RESTRICT`. Time comes from the UUIDv7
  `id`, not copied timestamps. A change row does not copy its parent; data a reader joins on becomes
  a typed column, and unjoined data stays in `metadata jsonb`. A change made by the system has a
  NULL actor.
- Durable work queue: one vocabulary (`lease_token`, `leased_at`, `lease_expires_at`,
  `attempt_count`, `available_at`, `generation` only when a re-enqueue can race a worker). Every
  renew, complete or fail writes `WHERE lease_token = $mine`, so a worker that lost its lease
  changes nothing. If the row exists only because of the work, the lease lives on it; if the record
  outlives the job, the lease moves to `<entity>_<job>_work_items` keyed by the entity id with a
  cascade FK. No shared polymorphic lease table. Retries needing their own record are `_attempts`
  rows. One-shot compare-and-set claims and human assignments are not worker leases.

## R5 — Helpers, not copies

- Trigger functions that differ only by table or message are one generic function parameterized by
  `TG_ARGV` (`fn_reject_mutation` allows an UPDATE only when listed actor columns go NULL and a
  DELETE only inside a parent cascade).
- A reference that must stay under the same parent is a composite FK (`UNIQUE (parent_id, id)` on
  the target), not a guard trigger. Default `MATCH SIMPLE` skips the check when the reference is
  NULL. A multi-hop source carries its owning scope id so the FK stays concrete.
- Split when the columns differ; share when only a value differs. Per-target tables differ in FK
  target and stay split. Tables with matching columns share one table, with a discriminator column
  only when rows differ in meaning. Subtype-only columns go in a subtype table keyed by the base
  row's id. A row with one of several sources uses an exclusive arc (one nullable FK per source plus
  `CHECK (num_nonnulls(...) = 1)`), never a type/id pair.

## R6 — Query shape

- A query on a partitioned table constrains its partition key, or is declared cross-partition with
  a reason. Partition by the dominant access key; `RANGE(id)` only when every hot reader carries an
  id or time bound.
- UUIDv7 tables filter and order by `id`, not `created_at`, which cannot use the `id` index.
- **A `view_*` view is read only by its key.** Pick ids from indexed base tables, then read the view
  by those ids. Filtering, sorting, paging, or counting on view columns computes every row before
  the page is cut, so cost grows with the table. Whole-table totals read precomputed results.
  Enforced by `postgres-required-predicates` (`requireColumns`).
- Never bound ids in SQL with `uuidv7(...)`: it is volatile, so the predicate is only a filter that
  cannot use an index or skip partitions. Pass a TypeScript-computed bound or a STABLE inlinable
  helper.
- Explicit column lists for tables (no `SELECT *`, `alias.*`, `RETURNING *`); a view may be read
  with `*` because its column list is the reviewed contract. No `OFFSET`; an optimizer fence is a
  `MATERIALIZED` CTE.

## R7 — Every table, column and view has a comment

Comments are the schema's documentation, so they are enforced for tables, columns, and application
views (generated tables get theirs from their generators). A view comment states its projection or
privacy boundary. A column is exempt only when its name says what it holds (`id`, `created_at`).

## Index every foreign key with a referential-integrity-usable leading index

PostgreSQL does not auto-index FK columns, so an unindexed FK makes every parent `DELETE` and every
`ON DELETE RESTRICT` check sequential-scan the child. The FK must be the leading column of some
index. A partial index `WHERE <fk> IS NOT NULL` is usable; `WHERE deleted_at IS NULL` is not,
because cascades and RESTRICT checks touch soft-deleted children too. `SET NULL` audit columns
(`*_by_id` to users) are the systemic exception: index only those on large tables.

## Large aggregation recomputes read the replica and absorb lag asynchronously

A full recompute of a tally over a large append-only table reads the replica, not the primary, so
bulk aggregation adds no primary load. Absorb replica lag by running the recompute asynchronously
with throttle deduplication, an ordering key, and a delay of the throttle window plus a lag safety
margin (see the [elections queue timing](../overview/architecture/queues/README.md)). A
recompute written back from a replica carries a freshness marker captured by the exact aggregate
statement (the snapshot `xmax` plus in-progress count) and accepts only a later one, so
out-of-order jobs cannot roll a newer tally back. The marker does not make residual lag
self-healing; this is a deliberate eventual-consistency tradeoff. Freshness-critical synchronous
paths may read the primary.

## Derive `created_at` from the UUIDv7 `id`, never a wall-clock default

A UUIDv7 key already encodes creation time. A separate `created_at DEFAULT now()` is a second,
independently drifting source of the same fact, and an index sorting by it duplicates the ordering
`id` provides. Define `created_at` as `GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL`
(`STORED` only when indexed), and order and paginate by `id`.

## Related

- [Partitioning strategy](../overview/architecture/partitioning-strategy.md)
- [Schema Checks](reference-tests-schema-checks.md)
