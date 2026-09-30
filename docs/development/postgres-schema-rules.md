# PostgreSQL Schema Quality Rules

Defect classes surfaced by SQL review that are easy to reintroduce. These are authoritative agent
rules; the terse pointer lives in [backend/data-stores/psql/AGENTS.md](../../backend/data-stores/psql/AGENTS.md).
Each rule links the tracking issue for its static-analysis guard / fix.

## Prelaunch relational storage

Voucha has not launched. Change the canonical schema creators and current callers together, then
rebuild disposable databases. Migrations still provide deterministic fresh installation, a ledger,
checksum verification, transactional execution, and current seeds/views. They are not a sequence of
upgrade deployments to preserve historical app contracts. Do not add backfills, dual writes,
compatibility readers, or activation stages for old application versions. Keep external protocols,
security key rotation, and exact replay envelopes where those contracts actually require them.
Launch behavior and worktree-database recovery follow
[One current contract](../../AGENTS.md) and
[Ephemeral worktree databases](../../AGENTS.md).

An internal entity reference is a column or child row with a concrete foreign key and a supporting
index, including a reference stored in a primary or unique key. Extract that id from a JSON document
(other than change history, below) or a UUID array. Leave the rest of the document in JSON. Do not delete a JSON document and replace
it with a typed column for every field.

Structured documents stay JSON. Data points stay structured JSON. A data-point field that references
an entity, such as a topic id, is a foreign-key column. Counts, amounts, and the other structured
fields stay in the JSON.

Change history stays JSON. Do not extract before/after values, and do not add foreign keys for ids
that appear only in a history document. History is for tracking and is not joined. Revision `changes`
documents and config or prompt previous/next field documents are history.

Live references point at live tables. An entity that must remain referenceable after deletion has its
own retained-identity row. Durable rows that outlive the entity reference that row. A retained
identity does not authorize a deleted entity. Keep only the identity and lifecycle fields that
existing retention needs. Model alternatives as per-entity FK columns with an exact-one-target
constraint or as typed child rows. Do not use a UUID array, type/id pair, generic attribute/value
table, or encoded string key as relationship storage.

The canonical user, topic, post, and RSS-item creators register their concrete retained identity
inside the live-row insertion transaction. Live rows FK back to that owner; deletion may remove the
live row while a request, audit record, or publication bridge keeps the owner. Root reservation is
not proof that the live entity exists or that an operation is authorized. The independent bounded
[retained-identity cleanup](../overview/architecture/services/data-retention/README.md#key-exports) removes
an owner only after its live row and every durable reference have gone; audit rows have no inferred
expiry.

Image delivery repair retains a concrete image identity and an immutable placement binding with an
exact post or surface family. The owner transaction creates that binding, pins the image root and
the binding in that order, then inserts the live placement. A repair marker references an already
committed registry delivery key; it is not a direct pin of a reservation made before the owner
transaction. Live image and placement rows, registry records, and repair markers use concrete FKs,
but retained identity alone never grants delivery. Scheduled bounded cleanup removes an orphan
binding after its last live, registry, and marker reference, then removes an unreferenced image
root in a separate sweep.

Elected relation history uses 17 metadata-derived `retained_relation__*` identity owners, each
keyed by the authoritative `(subject_id, id)` pair and FK-linked to its concrete subject root.
Only the actual vote `DELETE RETURNING` tuple may reserve one for user-deletion work; neither a
candidate nor a later live-relation lookup proves the deleted target. Typed, exact-one impact
columns FK to those pairs, and pending relation effects FK to an impact in the same deletion
request. The owners are unpartitioned: they contain only active deletion-work identities, not
permanent copies of live relation rows; composite-key and target indexes keep access selective.
Reconsider partitioning at sustained one-million-row cardinality or measured pressure. A bounded
relation-identity sweep removes each owner once no impact references it, even if the live relation
still exists. The subsequent root sweep also checks all 17 retained-relation references.

JSON that stays includes structured application documents, change history, exact reviewed opaque
provider documents, external protocol payloads, and replay envelopes. The
[relational-storage catalog](../../static-code-analysis/repo-file-policy/relational-storage-catalog.mts)
records reviewed opaque columns, non-relationship UUID tokens, and the two reviewed id categories
below. There is no debt inventory: every UUID array, missing foreign key, or encoded key fails the
guard unless a reviewed catalog entry covers it, and a UUID array has no catalog exception. A
catalog entry whose column no longer has the defect is stale and must be removed.

Two reviewed categories need no foreign key, and each catalog entry is an exact `table.column` with
a one-line reason. A **token, cursor or protocol identifier** is an opaque id with no owning row to
reference: a client device or session token, an ActivityPub activity id, a traversal cursor, or a
provider idempotency key. An **audit snapshot identifier** is an id recorded at write time and never
joined for authorization; it must outlive its source row, so a foreign key would either block the
source's deletion or erase the record. An id that authorizes, or that can dangle without an audit
reason, still takes a foreign key. Entering either category needs plan review.
The
[schema guard](../../static-code-analysis/repo-file-policy/relational-storage-guard.mts) runs on the
committed PostgreSQL-generated snapshot. It rejects unresolved domain types before UUID-array and
relation classification. A JSON column is not a defect. The guard cannot see an id hidden inside a
document; review of the producer and consumer does that. Naming checks catch reference-like UUIDs,
scoped encoded keys only while they stay textual, and sole UUID primary keys that are neither
generated nor foreign-keyed. A generated alias is accepted only with its exact source expression,
each source foreign key, and the exact `num_nonnulls(...) = 1` check. Valid composite and proven
partition FKs are accepted. The partition proof reads the target checkout's generated
entity-relation SQL.

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

`postgres-no-add-column` requires new columns to be folded into the original prelaunch
`CREATE TABLE`. Its exception list in [`.no-mistakes.yml`](../../.no-mistakes.yml) is empty;
do not add upgrade-only column migrations. The rule rejects mismatched operations and stale
exceptions.

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

This generalizes the existing vote-score rule in [psql AGENTS.md](../../backend/data-stores/psql/AGENTS.md).
Tracked by #7354.

## Large aggregation recomputes read the replica and absorb lag asynchronously

When a recomputed tally/counter over a large or unbounded append-only table (e.g. vote-score
aggregation, `SET votes_score_up = <recomputed>`) is written back as an idempotent full
recompute, read the **replica**, not the primary — do not add primary-read load for bulk
aggregation. Handle replica lag by running the recompute asynchronously with throttle
deduplication, an ordering key, and a fixed delay through the full throttle window plus a
replica-lag safety margin. For election tallies, a five-second throttle and one-second margin yield
a six-second delay; see the [elections queue timing](../overview/architecture/queues/elections/README.md).
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
`rss_feed_item_votes`, `agent_moderation_votes`, `user_vouch_votes`, `entity_relation_votes`) and
`user_deletion_relation_impacts` are created from TypeScript in
`backend/data-stores/psql/config-driven/` rather than migration SQL, so they stay in
`extraGeneratedColumns`.

Tracked by #7359.

## Related

- [backend/data-stores/psql/AGENTS.md](../../backend/data-stores/psql/AGENTS.md) — authoritative schema rules
- [Partitioning strategy](../overview/architecture/partitioning-strategy.md)
- [Schema Checks](reference-tests-schema-checks.md) — CI enforcement for the schema snapshot
