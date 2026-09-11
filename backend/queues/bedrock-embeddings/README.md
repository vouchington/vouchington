# Bedrock Embeddings (Real-Time Single)

This system processes individual embedding requests in real time so that embeddings are available as soon as possible after entity creation or update. It handles `post`, `topic`, and `rss_feed_item` entities.

For batch embedding processing (eventual consistency, includes `crawl_chunks`), see [../bedrock-embeddings-batch/README.md](../bedrock-embeddings-batch/README.md).

For the dedup contract, centralized table semantics, race outcomes, and bloom filter details, see [../../services/bedrock-embeddings/README.md](../../services/bedrock-embeddings/README.md).

## Active Workers

| Worker Export                                  | Queue                                          | Concurrency | Rate Limit | Dedup              |
| ---------------------------------------------- | ---------------------------------------------- | ----------- | ---------- | ------------------ |
| `bedrock_embeddings_nova_multimodal_v1_single` | `bedrock_embeddings_nova_multimodal_v1_single` | 10          | 10 jobs/s  | Debounce TTL: 60 s |

## Queue Configuration

- Do not inline-process embeddings during tests — rate limits require proper job queue handling (glide-mq vitest shim skips this queue).

## Processors

| Job Name        | Entity Type     | Description                                                                                                                                                                    |
| --------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `post`          | `post`          | Fetches post, calls `upsertPostEmbedding`, short-circuits if already up-to-date; then enqueues ban-evasion detection when the embedded post is the user's first community post |
| `topic`         | `topic`         | Fetches topic, calls `upsertTopicEmbedding`, short-circuits if already up-to-date                                                                                              |
| `rss_feed_item` | `rss_feed_item` | Fetches RSS feed item, calls `upsertRssFeedItemEmbedding`, short-circuits if already up-to-date; then enqueues `story-clustering` via `enqueueStoryClustering`                 |

Each processor delegates to `createSingleEmbedding` in `@services/bedrock-embeddings/single/`, which:

1. Checks `isEntityLockedForBatch` — no-ops if a batch job holds the lock.
2. Calls `lookupExistingEmbedding` against the centralized table — reuses the vector if found.
3. Otherwise calls Bedrock, writes to the centralized table, and updates the entity row (guarded by `content_sha256`).

## Enqueue Functions

Jobs are enqueued from entity listeners via:

- `enqueueCreateTopicEmbedding`
- `enqueueCreatePostEmbedding`
- `enqueueBulkCreateRssFeedItemEmbeddings`

All three functions check the real-time queue depth before enqueueing. When `waiting + active` in the single queue reaches `backlog_threshold` (default 1000, configurable in the `bedrock-embeddings-batch-config` Dynamic Config namespace), the enqueue is skipped and a `single_skipped_for_backlog` analytics event is emitted. Pending entities are still picked up by the batch `creation_dispatcher`, so no data is dropped. The depth check uses a 2-second in-process cache to avoid a Valkey roundtrip on every entity-creation event.

## Related

- [../../services/bedrock-embeddings/README.md](../../services/bedrock-embeddings/README.md) — Dedup contract, centralized table, bloom filter
- [../bedrock-embeddings-batch/README.md](../bedrock-embeddings-batch/README.md) — Batch pipeline
- [../README.md](../README.md) — All active workers
