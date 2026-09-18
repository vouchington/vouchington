# Valkey Requests — bedrock-embeddings-batch

Application-level Valkey calls issued **per job** on the shared singleton
clients. Excludes glide-mq stream ops (XADD/XREADGROUP/XACK on the worker's own
connections). See `predecessor-issue#4717`.

| Call site (service / file)                                                                                               | Client | Operation     | Calls / job        |
| ------------------------------------------------------------------------------------------------------------------------ | ------ | ------------- | ------------------ |
| `services/bedrock-embeddings-batch/orchestrator/save.mts` → `addEmbeddingHashesToBloomFilter` (poll_batch on completion) | cache  | BF.MADD (Lua) | O(batch items/10k) |

**Total per job:** 0 for creation/dispatcher jobs; O(batch items/10k) BF.MADD ops (cache) for poll_batch jobs when the batch completes

## Notes

- Only the `poll_batch` job triggers Valkey writes, and only when the batch status is `Completed` or `PartiallyCompleted`. Creation, dispatcher, backlog, and stale-cleanup jobs have zero Valkey calls.
- `addEmbeddingHashesToBloomFilter` is called fire-and-forget (`.catch(onError)`) after DB writes for entity types topics/posts/rss_feed_items/crawl_chunks; image batches do not call it.
- Batch sizes are AWS Bedrock batch limits (potentially thousands of items), so O(batch items/10k) may be several BF.MADD ops per completed poll job.
