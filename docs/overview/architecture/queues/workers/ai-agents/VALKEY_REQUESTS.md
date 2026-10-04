# Valkey Requests — ai-agents

Application-level Valkey calls issued **per job** on the shared singleton
clients. Excludes glide-mq stream ops (XADD/XREADGROUP/XACK on the worker's own
connections). See `predecessor-issue#4717`.

| Call site (service / file)                                                             | Client | Operation          | Calls / job |
| -------------------------------------------------------------------------------------- | ------ | ------------------ | ----------- |
| `updateStoryPostAgentResult` → `invalidate.posts(postId)` (story-post job, on success) | cache  | invokeScript (Lua) | 1           |

**Shared cache total per job:** zero for jobs without cache invalidation; one cache call after a
successful `story-post` update. GlideMQ and the spend-cap registry use their own Valkey connections;
this table excludes those operations. No job publishes to the dedicated pubsub client.

## Notes

- `classifier-run-dispatcher`, `classifier-run`, `reconcile-classifier-runs`, and `autotagger-rss-feed-item` make no shared-cache calls.
- **Conditional:** `story-post` jobs that successfully generate a summary call `updateStoryPostAgentResult` → `invalidate.posts(postId)` = 1 `invokeScript` op on `cacheValkeyClient`.
- The classifier-run readiness checks (post and feed item embeddings) are PSQL queries, not Valkey calls.
