# PostgreSQL

- Load skills: `vouchington-postgres`, `postgres-schema-design`, `postgres-locking`, `postgres-partitioning-uuid-v7`, `postgresql-rules`.
- Schema docs: [PostgreSQL index](../../../docs/development/postgresql/README.md).
- Keep creators idempotent where possible. Hardcoded UUIDs are UUIDv7 (version nibble `7`).
- Never add `DROP TABLE` migrations. Fold new columns into their original creator; cross-file FKs
  use `ALTER TABLE ADD CONSTRAINT`.
- Fixed migrations and ledger inserts are transactional; never add manual `BEGIN`/`COMMIT` or
  online index-upgrade migrations.
- Vote schema uses [`election-schema-config.mts`](config-driven/utils/election-schema-config.mts).
- Prefer lifecycle timestamps over booleans/status columns. Keep final results on the owning row.
- No HASH partitions.

## Prelaunch storage

- Voucha has not launched: change the canonical creators and current callers together and rebuild
  disposable databases. Migrations are deterministic fresh installation, ledger, checksum and
  current seeds/views, not upgrade stages; no backfills, dual writes or compatibility readers.
  Keep external protocols, key rotation and exact replay envelopes where the contract needs them
  ([One current contract](../../../AGENTS.md)).
- The `postgres-no-add-column` exception list in `.no-mistakes/rules/policies.yml` is empty;
  adding an entry is not a fix.
- Seeds and generators in `config-driven/` and `views/` replay on every bootstrap and must converge.

## Relational storage

- An entity reference is a column or child row with a concrete FK and a supporting index, including
  inside a primary or unique key. JSON keeps structured documents, data points, change history,
  reviewed opaque provider documents, protocol payloads and replay envelopes. A data-point field
  that references an entity (a topic id) is an FK column.
- [`relational-storage-catalog.mts`](../../../static-code-analysis/repo-file-policy/relational-storage-catalog.mts)
  records reviewed exceptions; remove stale entries. A UUID array has no exception. Two categories
  need no FK, each with plan review: opaque token/cursor/protocol ids with no owning row, and audit
  snapshot ids that outlive their source and never authorize.
- Live references point at live tables. An entity that stays referenceable after deletion has its own
  retained-identity row, which never authorizes the deleted entity; root reservation does not prove
  the live entity exists. Cleanup removes an owner only after its live row and every durable
  reference are gone. Every durable row has a retention owner and window; indefinite retention needs
  a cited legal duty. Community creator provenance survives account deletion through a retained user
  identity, separate from the active owner membership (deleting the owner transfers authority to an
  eligible moderator or archives the community).
- `__` in a table name is reserved for generated entity-relation tables. Subtype extensions
  (pk = parent id) are `<subtype>_<parent>s`; a 1:N child stays `<parent>_<thing>s`.
- Relations and their votes have one generated table per relation; after launch a new relation adds
  its enum value in its own migration first. Vote sorting uses `votes_score_sort`, vote filters use
  `votes_score_net`; the one formula-input exception is
  [crawl priority](views/2026-05-07-rss-feed-crawl-inputs.sql).
- History (`_changes`, `_revisions`, `_attempts`, audit logs) never supplies current state. History
  tables are monthly `RANGE (id)` partitions dropped through `cleanupPartitions`; live rows never
  block that: no `latest_*_id` pointer, no RESTRICT FK from a live row, no reader deriving current
  state from the latest row. `_revisions.revised_by_id` is `SET NULL`; `_changes.changed_by_id`
  references the retained user identity with `RESTRICT`; a system change has a NULL actor.
- Durable work defaults to a GlideMQ job whose id is the durable row id, enqueued after commit, plus
  a bounded sweep; a lease or outbox table needs a stated reason (legal or Stripe records, values
  that vanish at commit, outcome committed with domain rows).
- Every table, column and application view has a comment; generated tables get theirs from their
  generators, and a view comment states its projection or privacy boundary.
- Large tally recomputes read the replica, run asynchronously after the throttle window plus a lag
  margin ([elections queue timing](../../../docs/overview/architecture/queues/README.md)), and
  write back with a freshness marker (snapshot `xmax` plus in-progress count) that only a later one
  replaces.
- Materialized views: defining query bounded by an indexed id range or window, a unique key index,
  a ranking index matching the read order, and an
  [explain-analyze scenario](../../../docs/development/postgresql/explain-analyze/README.md)
  (explained from `pg_get_viewdef`). The all-time referral-program link-count ranking is the
  approved full-history exception
  ([decision](https://github.com/vouchington/vouchington/issues/5220#issuecomment-6735267852)):
  it may lag one refresh and live program and topic eligibility is joined at read time.
