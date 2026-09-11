# RSS Feed Item Categories System

Reconciles durable RSS feed item category snapshots and backfills categories when topic aliases change.

## Queue Configuration

### `rss-feed-item-categories` (concurrency: 5)

- `processReconcileRssFeedItemCategorySnapshots` — drains up to 25 durable complete snapshots oldest-first, immediately queues another serialized page after a full successful batch, and retains the five-minute schedule for lost dispatches; exact-generation acknowledgement preserves newer crawls.
- `processBackfillCategoriesForTopicAliases` — re-categorizes all RSS feed items affected by a topic alias change

| Failure mode                                       | Detectable state                                          | Recovery/reconciliation path                                                                  | Idempotency guarantee                     | Evidence                                                                                                                              |
| -------------------------------------------------- | --------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Dispatch failure                                   | Snapshot row remains after the crawl commits              | Best-effort prompt logs; five-minute scheduler dispatches the same drain                      | One coalesced row per item                | `category-snapshot-reconciliations.test.mts`: absent prompt recovery                                                                  |
| Provider non-consumption                           | Not applicable; the operation has no external provider    | Scheduler redelivers pending PostgreSQL work                                                  | Exact category snapshot upsert            | Same absent-prompt test                                                                                                               |
| Provider consumption followed by DB-commit failure | Not applicable; category writes are the durable effect    | Queue retry reruns the snapshot                                                               | Category upsert is repeat-safe            | Existing category snapshot tests                                                                                                      |
| Durable commit followed by reply loss              | Applied categories plus an unacknowledged snapshot row    | Retry reapplies, then acknowledges                                                            | Exact snapshot semantics                  | Existing category snapshot tests                                                                                                      |
| Retry/reconciliation                               | Pending row is ordered by `updated_at`, then item ID      | Each full 25-row drain queues the next serialized page; the schedule recovers lost dispatches | Generation-fenced acknowledgement         | `processors.test.mts`: full-batch continuation; `category-snapshot-reconciliations.test.mts`: bounded drain and stale acknowledgement |
| TTL expiry                                         | No durable intent has a TTL                               | Scheduler derives work from PostgreSQL, independent of Valkey retention                       | Stable item primary key                   | Absent-prompt recovery test                                                                                                           |
| Orphan cleanup                                     | Deleting an RSS item cascades its pending row             | PostgreSQL foreign key cleanup                                                                | `ON DELETE CASCADE`                       | PostgreSQL schema tests                                                                                                               |
| Normal terminal removal                            | Exact generation is deleted after category reconciliation | No further work remains unless a newer crawl writes a generation                              | Compare-and-delete by item and generation | `category-snapshot-reconciliations.test.mts`: successful drain                                                                        |

## Related

- Parent: [../CLAUDE.md](../CLAUDE.md)
- RSS feed items service: [../../services/rss-feed-items/README.md](../../services/rss-feed-items/README.md)
- Topic aliases system: [../topic-aliases/README.md](../topic-aliases/README.md)
