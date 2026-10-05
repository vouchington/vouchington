# Bedrock Embeddings Batch

Source entrypoint: [backend/queues/bedrock-embeddings-batch/README.md](../../../../../backend/queues/bedrock-embeddings-batch/README.md)

This system generates embeddings via the Bedrock Batch API for eventual consistency. It covers all entity types — `posts`, `topics`, `rss_feed_items`, `crawl_chunks`, and moderated `images` — and handles content changes across all entities.

Batch embeddings are **not** user-visible immediately (latency: minutes to hours). For real-time single embeddings, see [../bedrock-embeddings/README.md](../bedrock-embeddings/README.md).

For the dedup contract, centralized table semantics, race outcomes, and bloom filter details, see [../../services/bedrock-embeddings/README.md](../../services/bedrock-embeddings/README.md).

## Queue Configuration

- Creation runs on `bedrock-embeddings-batch-creation`, with one globally active job across worker replicas. Capacity checks and cloud reservations are separate operations, so this serialization preserves provider budgets. Delayed creation jobs yield the slot to another entity family.
- Polling, dispatch and reconciliation remain on `bedrock-embeddings-batch` with their existing ordering lanes. Enqueue admission does not process a batch inline.
- Creation roots use per-type simple deduplication. Bounded passes and capacity retries update the same durable job and move it to delayed; recurring scheduler roots coalesce until it completes or fails terminally.

## Scheduler

| Job                                                | Schedule      | Description                                                                                                                                                                       |
| -------------------------------------------------- | ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `creation_dispatcher`                              | `*/5 * * * *` | Scans DB for entities where `input_sha256 IS NULL OR input_sha256 != content_sha256` and no lock exists; enqueues creation jobs                                                   |
| `poll_dispatcher`                                  | `* * * * *`   | Queries all pending batches in `bedrock_embedding_batches`; enqueues polling jobs                                                                                                 |
| `backlog_dispatcher`                               | `* * * * *`   | Reads single-queue depth via `getQueueBacklogDepth`; if `waiting + active + delayed >= backlog_threshold` (default 1000, Dynamic Config), enqueues an extra `creation_dispatcher` |
| `stale_cleanup_dispatcher`                         | `0 * * * *`   | Finds batches stuck in `Submitted`/`InProgress` past `stale_ttl_hours` (default 24h, Dynamic Config); reconciles terminal-state batches or force-stops and cancels them           |
| `reconcile_existing_{topics,posts,rss_feed_items}` | `* * * * *`   | Copy reusable text embeddings from the centralized table in bounded pages, independent of Bedrock capacity                                                                        |
| `post_trigger_recovery`                            | `* * * * *`   | Retry ban-evasion queue delivery for current first-community-post embeddings                                                                                                      |

The four reconciliation roots run every minute in production and are clamped to hourly on staging.
The admin backfill `bedrock-embedding-reconciliation` starts all four roots. Each root is throttled
for 60 seconds by its flow and entity. A full page enqueues one cursor continuation with simple
deduplication by flow, entity, and opaque cursor; pending or active copies of that page coalesce.
Continuations have no throttle TTL or fixed job ID, so a later operator replay can start again.

`streamPending*` helpers used by the creation dispatcher skip any entity that already has a lock in `bedrock_embedding_batch_entities`.

The `backlog_dispatcher` exists so that very large single-embedding backlogs (e.g. tens of thousands of jobs after a bulk import) drain through the cheaper batch path faster than the 5-minute `creation_dispatcher` cadence allows. It only triggers an additional batch creation pass when the single queue is genuinely backed up.

## Ordering Lanes

| Lane             | Concurrency | Rate Limit | Description                                                                                       |
| ---------------- | ----------- | ---------- | ------------------------------------------------------------------------------------------------- |
| `polling`        | 10          | 10 jobs/s  | Polls batch status from Bedrock                                                                   |
| `dispatcher`     | 1           | —          | Scheduled dispatchers (`creation_dispatcher`, `poll_dispatcher`)                                  |
| `reconciliation` | 1           | —          | Copies reusable embeddings and recovers post/RSS trigger delivery without Bedrock capacity checks |

**Lock duration**: 300,000 ms (5 min); stalled interval: 30,000 ms. The creation worker uses the same lock duration to cover batch file uploads; its delayed jobs release the global active slot.

## Processors

| Job Name                   | Lane             | Description                                                                                            |
| -------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------ |
| `creation_dispatcher`      | `dispatcher`     | Dispatches creation jobs for all entity types every 5 minutes                                          |
| `poll_dispatcher`          | `dispatcher`     | Dispatches polling jobs for all pending batches every minute                                           |
| `backlog_dispatcher`       | `dispatcher`     | Triggers `creation_dispatcher` early when single-queue backlog exceeds the threshold                   |
| `stale_cleanup_dispatcher` | `dispatcher`     | Hourly: reconciles or force-cancels batches stuck past `stale_ttl_hours` (default 24h, Dynamic Config) |
| `topics`                   | creation queue   | Streams pending topics, builds batch file, submits to Bedrock                                          |
| `posts`                    | creation queue   | Streams pending posts, builds batch file, submits to Bedrock                                           |
| `rss_feed_items`           | creation queue   | Streams pending RSS feed items, builds batch file, submits to Bedrock                                  |
| `crawl_chunks`             | creation queue   | Streams pending crawl chunks, builds batch file, submits to Bedrock                                    |
| `images`                   | creation queue   | Streams moderated non-flagged images, builds image batch records, submits to Bedrock                   |
| `poll_batch`               | `polling`        | Polls a single batch by Bedrock Batch ID; on completion calls `applyBatchUpdates`                      |
| `reconcile_existing`       | `reconciliation` | Scans one bounded topic, post, or RSS item candidate page and copies cache hits                        |
| `post_trigger_recovery`    | `reconciliation` | Scans one pending post-delivery page and queues ban-evasion detection                                  |

`applyBatchUpdates` writes results to the centralized table with `INSERT ... ON CONFLICT DO NOTHING`, updates entity rows guarded by `content_sha256`, then deletes the lock from `bedrock_embedding_batch_entities`. Completed batches keep entity locks when result download fails before any result file exists; once result processing starts, locks and the temporary result file are cleaned up even if applying results fails.

Image batch creation logs per-image preprocessing failures. If pending images were seen but none could be added to the batch input, the creation job returns an explicit failed result instead of a silent no-op.

**Post-write side effects for RSS feed items:** single, batch-result, and reusable-copy paths call
`dispatchStoryClusteringForEmbeddedItems`, a best-effort enqueue of the stable-id
`classifier-run-dispatcher` job on `ai_agents` for the story-clustering classifier. A failed or
deduplicated enqueue is reported without failing the embedding job; the RSS item's durable run
request is recovered by the `reconcile-classifier-runs` sweep, so this queue has no RSS delivery
marker or recovery job.

## Bedrock Batch Limits

Bedrock batches are scheduled against configurable service quotas managed via the
`bedrock-embeddings-batch-config` Dynamic Config namespace (editable at `/admin/dynamic-config`):

- Active job count (`max_inflight_jobs`, default 100)
- Batch records created in the last hour (`max_requests_per_hour`, default 100000)
- JSONL records per input file (`max_requests_per_file`, default 100000)
- Input file size in GB (`max_file_size_gb`, default 1)
- Total active input size in GB (`max_job_size_gb`, default 100)
- Single-queue depth threshold for the `backlog_dispatcher` and per-enqueue skip guard (`backlog_threshold`, default 1000)
- Stale-batch TTL in hours for the `stale_cleanup_dispatcher` (`stale_ttl_hours`, default 24)

When capacity cannot fit the minimum batch, the same creation job saves its cursor and carried image IDs, then delays by the configured retry interval. Scheduler roots coalesce while it waits.

### Undersized Batches Defer

Bedrock requires at least `min_records_per_job` (default 100) entities per batch. When a creation job streams fewer than the minimum, it **defers**: no batch is submitted to AWS, and no fallback to single-embedding jobs runs. Capped image passes retain healthy unsubmitted IDs in the durable payload while scanning forward. Once a sweep drains, the next `creation_dispatcher` cycle re-streams pending entities so undersized tails can accumulate to the minimum naturally.

Rationale: posts, topics, and RSS feed items get real-time embeddings through the single pipeline on creation (see [`../bedrock-embeddings/README.md`](../bedrock-embeddings/README.md)). The batch pipeline is only used for entity _updates_ (and is the only path for `crawl_chunks` and `images`, which have no single-embedding fallback). Updates and bulk indexing have no user-facing latency requirement, so it is correct to wait for the minimum rather than convert undersized tails into many single-embedding jobs.

## Related

- [../../services/bedrock-embeddings/README.md](../../services/bedrock-embeddings/README.md) — Dedup contract, centralized table, bloom filter
- [../bedrock-embeddings/README.md](../bedrock-embeddings/README.md) — Real-time single pipeline
- [../README.md](../README.md) — All active workers
