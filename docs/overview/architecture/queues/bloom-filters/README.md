# Bloom Filters System

Source entrypoint: [backend/queues/bloom-filters/README.md](../../../../../backend/queues/bloom-filters/README.md)

Manages bloom filter lifecycle: failure recovery and admin rebuilds across multiple filter families.

## Processors

| Queue           | Processor                                | Purpose                                                | Trigger                                |
| --------------- | ---------------------------------------- | ------------------------------------------------------ | -------------------------------------- |
| `bloom-filters` | `processRebuildBloomFilter`              | Rebuild URL/email blocklists, API keys or embeddings   | Admin request or missing/failed filter |
| `bloom-filters` | `processRebuildEmbeddingBloomFilter`     | Admin embedding rebuild                                | Admin request                          |
| `bloom-filters` | `processBackfillBloomFilter`             | Rebuild posts, topics, users, communities or RSS items | Admin request or missing/failed filter |
| `bloom-filters` | `processBackfillUserBookmarkBloomFilter` | Rebuild a live user's bookmark filter                  | On demand                              |
| `bloom-filters` | `processDeleteUserBookmarkBloomFilter`   | Remove a deleted user's bookmark filter and markers    | User deletion                          |

There are no scheduled full rebuilds. The empty manifest is still registered at startup to remove
obsolete scheduler entries. Post-commit adds remain immediate; the existing
[entity-listener reconciliation window](../../services/entity-listener-reconciliation/README.md)
repairs missed adds, including renames and post slugs. Deleted keys and capacity growth are handled
by an admin rebuild.

## Worker Configuration

The `bloom-filters` worker uses batch mode (`batch: { size: 10, timeout: 1000 }`) with a default concurrency of 5 (baseline; adjustable via `WORKER_CONCURRENCY_BLOOM_FILTERS`). Batch mode amortizes the poll-loop overhead across up to 10 jobs per tick. Large streaming rebuilds use a 10 minute lock duration so long backfills are not marked stalled while they scan PostgreSQL and write Valkey batches.

Each physical bloom filter lane is serialized with `ordering.concurrency: 1` and a stable `bloomFilterRebuild__<filter>` job ID, so rebuilds for the same filter cannot overlap. Different filters can still run concurrently up to the worker's local concurrency limit.

Rebuild jobs remove completed and failed terminal records immediately, releasing the stable ID for
later failures or admin requests. While a job is active, its ordering lane and job ID prevent an
identical concurrent rebuild. Immediate adds write both live and building filters.

Entity-cache warmup and reads check both the ready marker and live filter. A failed add removes
readiness and requests a rebuild only when it removed a marker. Reads fall back to PostgreSQL until
the rebuild atomically replaces the live filter and publishes readiness. Missing reads/warmup can
request recovery again after a failed rebuild.

**Future work:** Add batch-aware `backfillUserBookmarkBloomFilterBatch(userIds[])` to group multiple users' filter rebuilds into a single BF.MADD round-trip per relation. Track progress via analytics metrics (issue `predecessor-issue#2263`).

## Recovery Contracts

`processDeleteUserBookmarkBloomFilter` has no backfill or reconciliation path: by the time recovery
would run, the deleted user's row is gone, so there is no durable table to re-derive a lost job
from. This is a documented accepted-loss exclusion (same precedent as `admin-imports`), bounded by
the bookmark bloom filter's own self-expiring TTLs. That bound now holds unconditionally: a
boot-time sweep (`@services/bloom-filter-maintenance`'s `sweepBookmarkBloomFiltersMissingTtl`)
attaches `BOOKMARK_BLOOM_FILTER_TTL_SECONDS` via `EXPIRE ... NX` to any live filter key left
without one, closing the crash window between `backfillUserBookmarkBloomFilter`'s RENAME and its
own TTL-setting `Batch` — see
[JOB-REPLAYABILITY.md § Queue Replayability Matrix](../../../../requirements/platform/JOB-REPLAYABILITY.md#queue-replayability-matrix)
and [bookmarks.md § Key Details](../../bookmarks.md#key-details).

`processDeleteUserBookmarkBloomFilter` and `processBackfillUserBookmarkBloomFilter` share the
`bookmark:{userId}` ordering key, which sequences the two jobs but does not cancel a backfill
already enqueued when a delete job lands — a backfill that outranks the delete job under that
ordering would otherwise recreate the filter for a deleted user (#8775).
`backfillUserBookmarkBloomFilter` closes this by checking `isUserActive` before rebuilding and
calling the idempotent `deleteUserBookmarkBloomFilter` on the deleted branch instead, so a stray
backfill now also self-heals a lost delete job rather than only relying on the TTLs above.

## Related

- Parent: [../AGENTS.md](../../../../../backend/queues/AGENTS.md)
- [Bloom Filter Config Service](../../services/bloom-filter-config/README.md)
