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
The `postgres-no-add-column` exception list in `.no-mistakes/rules/policies.yml` is empty;
adding an entry is not a fix.

- An internal entity reference is a column or child row with a concrete foreign key and a
  supporting index, including a reference inside a primary or unique key. The same id may also be
  copied in JSON or inside a fingerprint; the foreign key is the relation. Leave the rest of the
  document in JSON. Build deduplication keys from those foreign-key columns. Do not replace a
  document with a typed column per field.
- Structured documents and data points stay JSON. A data-point field that references an entity (a
  topic id) is a foreign-key column; counts, amounts, and the rest stay in the JSON.
- Change history stays JSON. Do not extract before/after values or add foreign keys for ids that
  appear only in a history document nothing joins, filters, or cleans up by: history is for tracking.
- Live references point at live tables. An entity that must stay referenceable after deletion has
  its own retained-identity row; durable rows that outlive the entity reference that row. A retained
  identity never authorizes a deleted entity, and root reservation does not prove the live entity
  exists. Cleanup removes an owner only after its live row and every durable reference are gone;
  each durable row has a retention owner, a window, and the requirement behind it. Indefinite
  retention requires a cited legal duty; retaining an identity does not extend the window of a row
  that references it.
- Community creator provenance survives account deletion through a retained user identity. It is
  separate from the active owner membership: deleting the owner transfers that authority to an
  eligible moderator or archives the community, preserving the community and its members.
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

- A reference is an FK column or FK child row, never a UUID array or a type/id pair. An id that
  something joins, filters, deletes, or retains by is never only inside JSON or only inside a hash;
  a copy in either may stay beside the foreign key. A history document that nothing joins or cleans
  up by may keep its ids. Build a dedup or fingerprint key from the foreign-key columns and the
  other identity fields, not from a hash of a document that contains relation ids.
- **Join on ids, never on text.** An outside string (vendor id, edge or cache key, slug, email) is a
  unique or generated column, never a primary or foreign key. Turn it into an id once where it
  enters. Looking up outside input by its unique text is fine; joining tables on it is not.
  Hashtag and category text matching is the only exception because the text is what is matched.
- A `uuid` column ending in `_id` belongs to a foreign key unless it is a cursor or high-water
  mark, a per-attempt fencing token, a kept-after-delete scope or audit id, an id living outside
  PostgreSQL, a pre-allocated id, or a natural key. Each exception has a reason in an allow entry.
- Relations and their votes have one table per relation, generated from metadata. Per-relation state
  is keyed by an enum generated from the same metadata; after launch a new relation adds its enum
  value in its own migration before anything uses it.
- Always use `votes_score_sort` for vote-based sorting and `votes_score_net` for vote-based filters.
  Sorting accounts for uncertainty in the vote evidence; filtering tests net weighted support.
  Keeping these roles separate prevents confidence adjustments from changing which rows qualify.
  The sole formula-input exception is
  [crawl priority](../../backend/data-stores/psql/views/2026-05-07-rss-feed-crawl-inputs.sql):
  net-score magnitude preserves topic votes' influence on crawl tiers alongside follower counts.

## R4 — One shape per concept

The owning row stores the final result that readers use. Audit and transition history explains
how it got there; `_changes`, `_revisions`, `_attempts`, lifecycle and audit logs never supply
current state. History tables are monthly `RANGE (id)` partitions, dropped through
`cleanupPartitions` once their retention window passes. Live rows must not block that retirement: no `latest_*_id` pointer
into history, no RESTRICT foreign key from a live row to history, and no reader deriving current
state from the latest history row.

- Field-diff history (`_revisions`): who edited content, `revised_by_id` to users `SET NULL`,
  append-only.
- Typed lifecycle log (`_changes`): a ledger entry whose actor must survive account deletion, so
  `changed_by_id` references the retained user identity with `RESTRICT`. Time comes from the UUIDv7
  `id`, not copied timestamps. A change row does not copy its parent; data a reader joins on becomes
  a typed column, and unjoined data stays in `metadata jsonb`. A change made by the system has a
  NULL actor.
- Durable work queue: default to a GlideMQ job whose job id is the durable row id, enqueued after
  commit, plus a bounded sweep that re-enqueues rows with no recorded outcome; GlideMQ supplies
  attempts, backoff, locking, stall recovery and unique ids. A lease or outbox table needs a stated
  reason: legal or payment (Stripe) records, old values that vanish at commit, or an outcome that
  must commit with domain rows. A unique job id stops duplicate enqueues, not duplicate runs, so
  idempotent DB-only work needs no fence. When a table is justified, prefer one compare-and-set
  fence on the outcome or a generation over the full lease columns. The lease shape: one vocabulary (`lease_token`, `leased_at`,
  `lease_expires_at`, `attempt_count`, `available_at`, `generation` only when a re-enqueue can race a worker). Every
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
- Time windows compare the raw UUIDv7 `id` against `getMinUUIDv7ForDate` bounds; never extract
  timestamps from the indexed `id` in a predicate, which prevents an ordinary id-index range scan.
- **A `view_*` view is read only by its key.** Pick ids from indexed base tables, then read the view
  by those ids. Filtering, sorting, paging, or counting on view columns computes every row before
  the page is cut, so cost grows with the table. Whole-table totals read precomputed results.
  Enforced by `postgres-required-predicates` (`requireColumns`).
- When a measured query needs a different index, review the query, index, and plans together. The
  index is part of the query's performance claim; separating them leaves either the reader or its
  access path unreviewable at the point of change.
- Never bound ids in SQL with `uuidv7(...)`: it is volatile, so the predicate is only a filter that
  cannot use an index or skip partitions. Pass a TypeScript-computed bound or a STABLE inlinable
  helper.
- Explicit column lists for tables (no `SELECT *`, `alias.*`, `RETURNING *`); a view may be read
  with `*` because its column list is the reviewed contract. No `OFFSET`.
- Default to the straightforward query: a plain walk, filters in WHERE, and `EXISTS`, `NOT EXISTS`
  or joins on keys. Any complex or non-obvious alternative, including UNION candidates,
  `MATERIALIZED` CTEs, LATERAL fences or planner steering, requires an EXPLAIN ANALYZE scenario and
  a benchmark against the straightforward shape showing its benefit. Put the evidence and tradeoff
  in the PR. A materialized prefix is an optimizer fence: later filters cannot reduce the work
  inside it, so its own read bound must hold independently. The advisory
  `postgres-bounded-statements` materialized-body check reports missing body bounds; configured
  per-owner bounds require a reason grounded in the write path. Whether a body holds the final
  result limit remains a review invariant.
- GROUP BY and DISTINCT serve real aggregates. Do not use them to deduplicate our own UNION or join
  output, or to test existence, unless the same EXPLAIN and benchmark comparison justifies an
  exception.
- **A list or feed read is one walk over the listed entity** or, for membership-ordered lists
  (saved posts and list items are uncapped user content, #4979), over the membership index joined to
  the targets, with eligibility in WHERE. Filters go in WHERE and are served by an index. Use, for example, `ORDER BY key DESC, id DESC LIMIT page+1` with a `(key, id) < ($1, $2)` keyset
  cursor; the cursor predicate matches every ordering key and direction.
  A keyset alone does not bound rows scanned. When a filter can reject long runs, such as a
  viewer's blocks or mutes, the time window is the scan bound where the sort has one, and EXPLAIN at
  representative cardinality compares rows read with rows returned. No candidate pools: no capped or `MATERIALIZED` CTE of
  the listed entity that is filtered or limited afterwards, no window loops or probes, no cursor
  proof state, no config field that sizes a candidate pool, and no new write caps (caps are best
  effort; see [lock scope](postgresql/reference-transactions.md#lock-scope)). A short or empty page is allowed
  only when it carries a continuation cursor and a "load more" signal (see bounding below). Small
  viewer-scoped sets (follows, mutes, blocks, memberships) may be subqueries or semi-joins. Compare
  plans against that single walk.
- **Use the simplest query that does the job.** The owner's principle (2026-11-09): "the basic
  premise is to use the simplest query, and making it more complex requires explain analyze
  plans." A plain walk has filters in WHERE, keyed joins, `EXISTS` / `NOT EXISTS` or subqueries,
  `ORDER BY`, and `LIMIT`. A ranked sort (hot, best) is a join and an `ORDER BY` on the score under
  the same principle. `GROUP BY` and `DISTINCT` are for real aggregates only: never to dedupe rows
  our own `UNION` or join produced, to test existence, or over a unique key.
  - **Added complexity needs plans in the PR.** CTEs over the listed entity, candidate pools,
    `UNION` candidate sets, `GROUP BY` / `DISTINCT` dedupe, `HAVING COUNT(*) = n` filters,
    `LATERAL` tricks, planner fences, multi-stage pipelines, and extra cursor state each need
    [explain-analyze](postgresql/explain-analyze/README.md) plans and a benchmark comparing the
    complex query with the simpler one. A comparison with old main does not count; main may be the
    unbounded outlier, and beating it shows nothing about the simpler query.
  - **A failed gate sends you to the simpler query first.** Check whether the simple query passes
    before adding layers. Never widen a gate to fit a more complex shape.
  - **Cite owner decisions verbatim.** In an issue or PR, quote and link the owner's words; never
    restate an agent's paraphrase as an owner decision.
    Why: PostgreSQL cannot stop early through a `GROUP BY` or `UNION` candidate pool, while a plain
    `EXISTS` semi-join lets the planner choose its direction from its estimates, and each layer added
    to pass a gate is one more thing to maintain. Unenforced.
- **Bound at the inputs.** Cap the number of filter terms first (for example, a bounded count of
  `#slug` terms per query, ANDed, with the same validation error in REST and MCP). Then use a plain
  index walk with per-row `EXISTS` probes, a cap on inspected rows, and a continuation cursor. A
  short or empty page is fine when it carries "load more" and the cursor. Do not cap product data
  (such as aliases per topic) to make a query cheap. Each cap is a `DynamicConfig` field with a
  default and a hard maximum. Unenforced.

## R7 — Every table, column and view has a comment

Comments are the schema's documentation, so they are enforced for tables, columns, and application
views (generated tables get theirs from their generators). A view comment states its projection or
privacy boundary. A column is exempt only when its name says what it holds (`id`, `created_at`).

## Index every foreign key with a referential-integrity-usable leading index

PostgreSQL does not auto-index FK columns, so an unindexed FK makes every parent `DELETE` and every
`ON DELETE RESTRICT` check sequential-scan the child. The FK must be the leading column of some
index. A partial index `WHERE <fk> IS NOT NULL` is usable; `WHERE deleted_at IS NULL` is not,
because cascades and RESTRICT checks touch soft-deleted children too. `SET NULL` audit columns
(`*_by_id` to users) need the same lookup support when a user is purged. Retention periods and
per-entity limits do not cap the global child table. Prefer a sparse `IS NOT NULL` index for
nullable actor references so rows without an actor add no index entries.

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

## Prefer no counter columns; trending and rankings are materialized views

A counter column needs maintenance: same-transaction updates, row triggers for cascades and hard
deletes, a `CHECK (count >= 0)`, and a purge test proving it stays exact. No periodic recount
repairs drift, because a repair job hides the write path that lost the update. Adding a counter
needs evidence that it is necessary. The advisory `postgres-column-check-constraints` check reports
integer `*_count` columns without a provable non-negative constraint; counter maintenance, purge
correctness, and the prohibition on periodic recount remain unenforced.

- **Displayed counts are capped counts.** Count over a `LIMIT cap + 1` subquery and return the exact
  number up to the cap plus a `capped` flag; clients render "1k+". The cap is a `DynamicConfig`
  field with a default and a hard maximum.
- **Trending and hot lists.** A non-personalized list that aggregates is a materialized view over a
  bounded window (see below), with an explain-analyze scenario. Personalized variants query on top
  of the view and join live eligibility (deleted, removed, hidden, disabled), so moderation takes
  effect at once. A per-row score already stored and indexed, such as a post's hot score, stays an
  index walk with no view.
- **Rankings by an unbounded count.** A capped count cannot sort, so a ranking such as referral
  programs by all-time active links is a materialized view of the counts, indexed by
  `(count DESC, id DESC)`, refreshed on a schedule, with live eligibility joined at read time. It is
  not a counter column.

## No unnecessary locks; caps and guards are best effort

Lock only to stop a concurrent write corrupting data the transaction writes: row locks on written
rows only, no advisory locks. Per-user and per-entity caps and "last X" guards check a capped count
and then write, with no lock, counter row, slot table, or admission-only constraint; overshoot under
a true race is accepted. Removing a lock deletes it rather than swapping in another serializer. A
rare race that must not break an invariant (write skew, such as an administrator keeping MFA) runs
the conflicting transactions at SERIALIZABLE; a serialization failure returns 409 with no retry,
and never a lock, advisory lock, or conflict-forcing column. The guard reads and decision write
run inside the same SERIALIZABLE transaction so SSI can track their read/write dependencies; a
guard read outside that transaction cannot protect the invariant. Why and owner words: [lock scope](postgresql/reference-transactions.md#lock-scope). Unenforced.

Tests for a writer that starts after a committed decision seed that committed state before invoking
the writer. Tests of overlapping transactions accept every valid race outcome rather than imposing
a lock order or assuming one writer must win.

## No per-row queries while holding locks

Inside a transaction that holds row or advisory locks, a check over many rows is one set-based
statement (for example `= ANY($1)` or a `VALUES`/`unnest` join), not a loop of awaited queries. A
loop multiplies lock hold time by the row count, so every writer waiting on those locks queues behind
it. See [lock scope](postgresql/reference-transactions.md#lock-scope) for which rows may be locked and
[set-based IO](../../.agents/skills/postgres-node-performance-tuning/SKILL.md) for batching.
The configured `query-reached-per-item` check reports statically traceable PostgreSQL and Valkey
effects reached from per-item loops. Lock scope remains a separate review invariant.

## Materialized views: bounded refresh, indexed read

A materialized view's defining query is limited by an indexed id range or time window (for example
`fn_min_uuidv7(...)` on a UUIDv7 key), never a full-history scan of a growing table, so refresh cost
tracks the window instead of table history. The one exception is an all-time ranking by an
unbounded count (see above): a window would drop older rows and corrupt the ranking, so its
defining query aggregates the indexed relation by group and is refreshed on a schedule off the
request path. The view has a unique index on its key and a ranking
index matching its read order, and reads are one keyset walk on that ranking index (see
[R6](#r6--query-shape)). The defining query has an
[explain-analyze scenario](postgresql/explain-analyze/README.md), which explains it from
`pg_get_viewdef` because `REFRESH` cannot be explained. View composition rules live in
[views](postgresql/reference-views.md). Scenario coverage is checked against the schema snapshot. The
advisory `postgres-materialized-view-shape` check reports missing refresh and additional indexes or
unproved bounds on indexed keys in the defining query. Matching the ranking index to the read order
and proving keyset read shape remain unenforced.

The owner-approved referral-program link-count ranking is an exception to the refresh window:
its all-time count requires a full-history refresh. Ranking freshness may lag one refresh; live
program and topic eligibility still applies in the indexed read. This moves aggregation out of
request handling without adding synchronous counter writes ([decision](https://github.com/vouchington/vouchington/issues/5220#issuecomment-6735267852)).

## Related

- [Partitioning strategy](../overview/architecture/partitioning-strategy.md)
- [Schema Checks](reference-tests-schema-checks.md)
