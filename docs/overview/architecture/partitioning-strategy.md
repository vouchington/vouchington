# PostgreSQL Partitioning Strategy

This is the decision record for PostgreSQL table growth. The per-table partition and
unbounded-table policies, with their rationale and reconsideration triggers, live in
[`schema-growth-registry.mts`](../../../backend/data-stores/psql/schema-growth-registry.mts).

## Policy

- Internal row, entity, and event IDs are UUIDv7. Natural/provider keys and the small static
  identity lookups are documented exceptions in the registry.
- Use `RANGE` on the UUIDv7 row or owning-parent key. HASH partitioning is forbidden.
- Tables that use operator-managed partition retirement start with one `DEFAULT` child. Add explicit
  aligned ranges on demand, then retire only ranges wholly outside the retention window. Classifier
  decision results use the batch UUIDv7 key so replay and reports remain time scoped.
- Tables without retention also start with one `DEFAULT` child. Add explicit aligned ranges once
  measured planner/write pressure or growth warrants it.
- Monthly children are retired by `cleanupPartitions`. Explicit UUIDv7 ranges may also be
  retired when their table owner declares a minimum retention window and the drop guard proves
  that the whole range is old enough. A default child has no upper bound and cannot be dropped.
- Every drop is checked in the backend against its declared window, open legal holds and
  unfinished work. A refusal leaves other eligible partitions available for retirement. The
  admin status preview caps row probes and marks unchecked children `check-pending`; cleanup
  always performs its own locked check before detach.
- An unpartitioned table classified as unbounded must record both its rationale and the condition
  that would trigger reconsideration.

```mermaid
flowchart LR
  A[Growth review] --> B{Retention?}
  B -->|Yes| C{Scheduled crawl lifecycle?}
  C -->|Yes| G[Monthly UUIDv7 RANGE]
  C -->|No| E[UUIDv7 RANGE with DEFAULT]
  B -->|No| D{Large or measured pressure?}
  D -->|Yes| E[UUIDv7 RANGE with DEFAULT]
  D -->|No| F[Unpartitioned with trigger]
```

`web_push_endpoint_owners` is intentionally unpartitioned: its SHA-256 endpoint key is the global
serialization and uniqueness point across the user-partitioned `web_push_subscriptions` table.
`notification_push_intent_subscription_receipts` retains delivery outcomes by exact subscription
generation, rather than an endpoint-only key.

`session_referral_attributions` ages out anonymous (`user_id IS NULL`) rows by batch deletion;
user-linked rows live with the account, and `deleteUser` nulls `user_id` so they join the sweep.
Its current default partition has no declared drop window. A future range-drop policy must
account for live user-linked rows before the owner can declare one.

## Operating Explicit Ranges

A populated default overlaps every prospective range. Create a standalone matching table, move the
range out of the default, validate range and default-exclusion `CHECK` constraints, then attach it.
Align bounds across tables joined by the same UUIDv7 parent key. Monitor defaults through the
partition-status API and `pg_total_relation_size()`.

Classifier results use a narrower operator path. An admin selects one UTC batch range; the worker
checks that every row in each result DEFAULT fits it under a fixed row budget and seals the existing
physical children as aligned explicit ranges in one transaction. A new DEFAULT receives later
results. An oversized or mixed DEFAULT refuses the operation before DDL. Expired DEFAULT results
and candidate snapshots are pruned in bounded pages, so a missed sealing window cannot permanently
block later range creation. Candidate snapshots join the aligned range because their batch-scoped
configuration is part of the retained decision payload. Calls and batches remain ordinary tables;
their bounded cleanup follows the result and snapshot pages. Classifier
range retirement is operator initiated and checks the configured retention window and pending work
under the partition locks. Its batch and run checks use indexed existence probes, so a sealed range
can grow beyond the creation row budget and still retire. If a producer holds the batch or run
table, the retirement transaction refuses the operation without waiting on a reverse lock order.
The scheduled monthly job still owns only crawl and RSS history.

Classifier run identities are a deduplication cache, while requests and usage are durable records.
Prompt-backed cache entries become expendable after a newer prompt version is active; promptless
entries follow their run payload's lifetime. Deleting a real subject also makes its cache entries
expendable. A live run retains its identity through the report window. Request settlement and billed
cost survive cache eviction without allowing the deleted subject to be replayed or authorized.

## Related

- [Partition Pruning Hints](partition-pruning-hints.md)
- [Database Rules](../../../backend/data-stores/psql/AGENTS.md)
- PostgreSQL queue
- [RSS feed crawling](../../requirements/content/RSS-FEED-CRAWLING.md)
- [PostgreSQL schema-growth prompt](../../prompts/scheduled/postgresql-schema-growth.md) — recurring schema-growth classification audit against this policy.
