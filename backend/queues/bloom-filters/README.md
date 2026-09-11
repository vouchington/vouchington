# Bloom Filters System

Manages bloom filter lifecycle: creation, population, backfilling, and scheduled rebuilds across multiple filter families.

## Processors

| Queue           | Processor                                | Purpose                                                                                                    | Schedule                                                      |
| --------------- | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `bloom-filters` | `processRebuildBloomFilter`              | Rebuilds URL blocklist, email blocklist, or API key bloom filter                                           | Weekly Sun 3AM UTC (URL), 6AM UTC (email), 8AM UTC (api-keys) |
| `bloom-filters` | `processPopulateBloomFilter`             | Populates embedding bloom filter from DB (addStream)                                                       | On worker startup                                             |
| `bloom-filters` | `processRebuildEmbeddingBloomFilter`     | Rebuilds embedding bloom filter (zero-downtime)                                                            | Weekly Sun 7AM UTC                                            |
| `bloom-filters` | `processBackfillBloomFilter`             | Backfills entity cache bloom filters (posts, topics, users, rss_feed_items)                                | Weekly Sun 4–5:30AM UTC (staggered 30min)                     |
| `bloom-filters` | `processBackfillUserBookmarkBloomFilter` | Backfills per-user bookmark bloom filter; no-ops and cleans up instead if the user is soft-deleted (#8775) | On-demand                                                     |
| `bloom-filters` | `processDeleteUserBookmarkBloomFilter`   | Deletes a deleted user's bookmark bloom filter + all per-relation ready keys (idempotent `UNLINK`)         | On-demand, enqueued fire-and-forget from `deleteUser`         |

## Worker Configuration

The `bloom-filters` worker uses batch mode (`batch: { size: 10, timeout: 1000 }`) with a default concurrency of 5 (baseline; adjustable via `WORKER_CONCURRENCY_BLOOM_FILTERS`). Batch mode amortizes the poll-loop overhead across up to 10 jobs per tick. Large streaming rebuilds use a 10 minute lock duration so long backfills are not marked stalled while they scan PostgreSQL and write Valkey batches.

Each physical bloom filter lane is serialized with `ordering.concurrency: 1` and `deduplication.mode: simple`, so startup/manual/scheduled rebuilds for the same filter cannot overlap. Different filters can still run concurrently up to the worker's local concurrency limit.

Entity-cache startup warmup only enqueues backfills for missing live filter keys. Existing live filters are kept in service and refreshed by weekly schedules plus write-time dual writes.

**Future work:** Add batch-aware `backfillUserBookmarkBloomFilterBatch(userIds[])` to group multiple users' filter rebuilds into a single BF.MADD round-trip per relation. Track progress via analytics metrics (issue [#2263](https://github.com/jonathanong/filaments/issues/2263)).

## Recovery Contracts

`processDeleteUserBookmarkBloomFilter` has no backfill or reconciliation path: by the time recovery
would run, the deleted user's row is gone, so there is no durable table to re-derive a lost job
from. This is a documented accepted-loss exclusion (same precedent as `admin-imports`), bounded by
the bookmark bloom filter's own self-expiring TTLs. That bound now holds unconditionally: a
boot-time sweep (`@services/bloom-filter-maintenance`'s `sweepBookmarkBloomFiltersMissingTtl`)
attaches `BOOKMARK_BLOOM_FILTER_TTL_SECONDS` via `EXPIRE ... NX` to any live filter key left
without one, closing the crash window between `backfillUserBookmarkBloomFilter`'s RENAME and its
own TTL-setting `Batch` — see
[JOB-REPLAYABILITY.md § Queue Replayability Matrix](../../../docs/requirements/platform/JOB-REPLAYABILITY.md#queue-replayability-matrix)
and [bookmarks.md § Key Details](../../../docs/overview/architecture/bookmarks.md#key-details).

`processDeleteUserBookmarkBloomFilter` and `processBackfillUserBookmarkBloomFilter` share the
`bookmark:{userId}` ordering key, which sequences the two jobs but does not cancel a backfill
already enqueued when a delete job lands — a backfill that outranks the delete job under that
ordering would otherwise recreate the filter for a deleted user (#8775).
`backfillUserBookmarkBloomFilter` closes this by checking `isUserActive` before rebuilding and
calling the idempotent `deleteUserBookmarkBloomFilter` on the deleted branch instead, so a stray
backfill now also self-heals a lost delete job rather than only relying on the TTLs above.

## Related

- Parent: [../CLAUDE.md](../CLAUDE.md)
- [Bloom Filter Config Service](../../services/bloom-filter-config/README.md)
