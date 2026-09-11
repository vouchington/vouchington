# Bedrock Embeddings Batch

This system generates embeddings via the Bedrock Batch API for eventual consistency. It covers all entity types — `posts`, `topics`, `rss_feed_items`, `crawl_chunks`, and moderated `images` — and handles content changes across all entities.

Batch embeddings are **not** user-visible immediately (latency: minutes to hours). For real-time single embeddings, see [../bedrock-embeddings/README.md](../bedrock-embeddings/README.md).

For the dedup contract, centralized table semantics, race outcomes, and bloom filter details, see [../../services/bedrock-embeddings/README.md](../../services/bedrock-embeddings/README.md).

## Queue Configuration

- Do not use `BULLMQ_INLINE_MODE` here — rate limits must be respected and cannot be guaranteed without real queue handling.

## Scheduler

| Job                        | Schedule      | Description                                                                                                                                                             |
| -------------------------- | ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `creation_dispatcher`      | `*/5 * * * *` | Scans DB for entities where `input_sha256 IS NULL OR input_sha256 != content_sha256` and no lock exists; enqueues creation jobs                                         |
| `poll_dispatcher`          | `* * * * *`   | Queries all pending batches in `bedrock_embeddings_batches`; enqueues polling jobs                                                                                      |
| `backlog_dispatcher`       | `* * * * *`   | Reads single-queue depth via `getQueueStats`; if `waiting + active >= backlog_threshold` (default 1000, Dynamic Config), enqueues an extra `creation_dispatcher`        |
| `stale_cleanup_dispatcher` | `0 * * * *`   | Finds batches stuck in `Submitted`/`InProgress` past `stale_ttl_hours` (default 24h, Dynamic Config); reconciles terminal-state batches or force-stops and cancels them |

`streamPending*` helpers used by the creation dispatcher skip any entity that already has a lock in `bedrock_embeddings_batch_entities`.

The `backlog_dispatcher` exists so that very large single-embedding backlogs (e.g. tens of thousands of jobs after a bulk import) drain through the cheaper batch path faster than the 5-minute `creation_dispatcher` cadence allows. It only triggers an additional batch creation pass when the single queue is genuinely backed up.

## Ordering Lanes

| Lane         | Concurrency | Rate Limit | Description                                                                        |
| ------------ | ----------- | ---------- | ---------------------------------------------------------------------------------- |
| `creation`   | 1           | —          | Creates new Bedrock batch files; serialized to avoid exceeding request/file limits |
| `polling`    | 10          | 10 jobs/s  | Polls batch status from Bedrock                                                    |
| `dispatcher` | 1           | —          | Scheduled dispatchers (`creation_dispatcher`, `poll_dispatcher`)                   |

**Lock duration**: 300,000 ms (5 min); stalled interval: 30,000 ms (default) — lock duration sized for the `creation` lane (p99 minutes for large batch file uploads); applies to all lanes on the single worker.

## Processors

| Job Name                   | Lane         | Description                                                                                            |
| -------------------------- | ------------ | ------------------------------------------------------------------------------------------------------ |
| `creation_dispatcher`      | `dispatcher` | Dispatches creation jobs for all entity types every 5 minutes                                          |
| `poll_dispatcher`          | `dispatcher` | Dispatches polling jobs for all pending batches every minute                                           |
| `backlog_dispatcher`       | `dispatcher` | Triggers `creation_dispatcher` early when single-queue backlog exceeds the threshold                   |
| `stale_cleanup_dispatcher` | `dispatcher` | Hourly: reconciles or force-cancels batches stuck past `stale_ttl_hours` (default 24h, Dynamic Config) |
| `topics`                   | `creation`   | Streams pending topics, builds batch file, submits to Bedrock                                          |
| `posts`                    | `creation`   | Streams pending posts, builds batch file, submits to Bedrock                                           |
| `rss_feed_items`           | `creation`   | Streams pending RSS feed items, builds batch file, submits to Bedrock                                  |
| `crawl_chunks`             | `creation`   | Streams pending crawl chunks, builds batch file, submits to Bedrock                                    |
| `images`                   | `creation`   | Streams moderated non-flagged images, builds image batch records, submits to Bedrock                   |
| `poll_batch`               | `polling`    | Polls a single batch by Bedrock Batch ID; on completion calls `applyBatchUpdates`                      |

`applyBatchUpdates` writes results to the centralized table with `INSERT ... ON CONFLICT DO NOTHING`, updates entity rows guarded by `content_sha256`, then deletes the lock from `bedrock_embeddings_batch_entities`. Completed batches keep entity locks when result download fails before any result file exists; once result processing starts, locks and the temporary result file are cleaned up even if applying results fails.

Image batch creation logs per-image preprocessing failures. If pending images were seen but none could be added to the batch input, the creation job returns an explicit failed result instead of a silent no-op.

**Post-write side effects for RSS feed items:** after `applyRssFeedItemBatchUpdates` or `copyExistingRssFeedItemEmbeddings` writes embeddings, `enqueueBulkStoryClustering` is called once per updated item so that story clustering runs for items embedded via the batch path — the same trigger that the real-time single worker fires immediately after embedding.

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

If the in-flight job cap would be exceeded, creation jobs re-enqueue themselves every minute until there is enough headroom.

### Undersized Batches Defer

Bedrock requires at least `min_records_per_job` (default 100) entities per batch. When a creation job streams fewer than the minimum, it **defers**: no batch is submitted to AWS, and no fallback to single-embedding jobs runs. The next `creation_dispatcher` cycle (every 5 minutes) re-streams pending entities, so the batch waits to accumulate to the minimum naturally.

Rationale: posts, topics, and RSS feed items get real-time embeddings through the single pipeline on creation (see [`../bedrock-embeddings/README.md`](../bedrock-embeddings/README.md)). The batch pipeline is only used for entity _updates_ (and is the only path for `crawl_chunks` and `images`, which have no single-embedding fallback). Updates and bulk indexing have no user-facing latency requirement, so it is correct to wait for the minimum rather than convert undersized tails into many single-embedding jobs.

## Related

- [../../services/bedrock-embeddings/README.md](../../services/bedrock-embeddings/README.md) — Dedup contract, centralized table, bloom filter
- [../bedrock-embeddings/README.md](../bedrock-embeddings/README.md) — Real-time single pipeline
- [../README.md](../README.md) — All active workers
