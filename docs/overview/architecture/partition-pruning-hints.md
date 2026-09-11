# PostgreSQL Partition Pruning Hints

The [partitioning strategy](partitioning-strategy.md) owns the exact schema inventory. This page
only defines query-writing and verification rules.

## Query Rules

- A pruning predicate must constrain the partition key of the table being scanned. A bound on a
  joined table is not a hint for the other relation.
- UUIDv7 IDs are time ordered. Use valid ownership/order invariants to add bounds such as
  `child.post_id = parent.id`; never infer an order the schema does not guarantee.
- Post descendants may use `id > parent_id` or `id > root_id`. Post-keyed children and post-subject
  relations prune through equality on `post_id` or `subject_id`.
- `rss_feed_crawls` may combine `rss_feed_id = $1` with `id > $1` because a crawl follows its feed.
- Fat-table `rss_feed_items` reads should bound `rss_feed_items.id`; listing cursors already do so.
  The `<=>` vector-similarity readers intentionally cannot prune by `id` and will probe every HNSW
  graph once explicit range children exist. Re-evaluate those plans before attaching ranges; the
  default-only launch layout keeps one graph.
- `crawl_chunks` must constrain `crawl_id` whenever `crawls.id` is already known or bounded.
- Entity-relation votes need both `relation_table` and `entity_relation_id` for full LIST then RANGE
  pruning. Ordinary votes need their configured target column.
- Voter-only deletion/export has no target key and intentionally scans each range. Preserve the
  per-child `user_id` indexes and keep explicit partition counts modest.
- `session_referral_attributions` reads bound `session_id`, `referrer_id`, or `user_id` — none of
  which constrain `id` — so they will probe every child once explicit ranges are attached; costs
  nothing today with the default-only launch layout. `getNetworkEffects` already bounds
  `id > $periodStartUuid` and prunes correctly. `deleteOldReferralAttributionBatch()` binds
  `id < cutoffId` and will also prune correctly once explicit ranges exist — the batch-delete path
  benefits most from pruning since it is the highest-volume reader.

## Plan Verification

Use at least two explicit ranges plus the default so a plan can demonstrate actual pruning. Check
both forced custom and generic prepared plans; a literal-only plan does not prove parameterized
production behavior.

```sql
SET plan_cache_mode = force_custom_plan;
EXPLAIN (ANALYZE, BUFFERS) SELECT ...;

SET plan_cache_mode = force_generic_plan;
PREPARE pruning_check(uuid) AS SELECT ... WHERE partition_key = $1;
EXPLAIN (ANALYZE, BUFFERS) EXECUTE pruning_check($1);
```

Inspect `Subplans Removed`, scanned child names, row estimates, and execution time. The repository
workflow is `pnpm run explain:seed`, `pnpm run explain:run`, and `pnpm run explain:analyze`.

## Related

- [Partitioning Strategy](partitioning-strategy.md)
- [Database Rules](../../../backend/data-stores/psql/CLAUDE.md)
- [PostgreSQL queue](../../../backend/queues/psql/README.md)
