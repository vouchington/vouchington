# Valkey Requests — ai-agents

Application-level Valkey calls issued **per job** on the shared singleton
clients. Excludes glide-mq stream ops (XADD/XREADGROUP/XACK on the worker's own
connections). See `predecessor-issue#4717`.

| Call site (service / file)                                                             | Client | Operation          | Calls / job                |
| -------------------------------------------------------------------------------------- | ------ | ------------------ | -------------------------- |
| `updateStoryPostAgentResult` → `invalidate.posts(postId)` (story-post job, on success) | cache  | invokeScript (Lua) | 1                          |
| `getPostByAnyCachedBatch` / `getRssFeedItemByIdCachedBatch` (search tools)             | cache  | MGET               | 1–2 per tool call          |
| `getTopicByAnyCachedBatch` (`compare_topics` tool)                                     | cache  | MGET               | 1 per tool call            |
| `getCachedSearchEmbedding` (semantic search tools)                                     | cache  | GET/SET            | 1 lookup; +1 write on miss |

**Total per job:** 0–N on shared singletons (conditional on job type and tool calls); no job publishes to the dedicated pubsub client.

## Notes

- `classifier-run-dispatcher`, `classifier-run`, `reconcile-classifier-runs`, `autotagger-rss-feed-item`, `moderation-*`, `community-moderation-*` use only PSQL and external AI APIs — zero shared-singleton Valkey calls.
- **Conditional:** `story-post` jobs that successfully generate a summary call `updateStoryPostAgentResult` → `invalidate.posts(postId)` = 1 `invokeScript` op on `cacheValkeyClient`.
- The classifier-run readiness checks (post and feed item embeddings) are PSQL queries, not Valkey calls.
