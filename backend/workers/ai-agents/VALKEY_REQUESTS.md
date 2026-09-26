# Valkey Requests — ai-agents

Application-level Valkey calls issued **per job** on the shared singleton
clients. Excludes glide-mq stream ops (XADD/XREADGROUP/XACK on the worker's own
connections). See `predecessor-issue#4717`.

| Call site (service / file)                                                             | Client             | Operation          | Calls / job                 |
| -------------------------------------------------------------------------------------- | ------------------ | ------------------ | --------------------------- |
| `process-chat.mts` → `publishChatToken` (chat job only)                                | pubsub (dedicated) | PUBLISH            | O(tokens) per chat response |
| `updateStoryPostAgentResult` → `invalidate.posts(postId)` (story-post job, on success) | cache              | invokeScript (Lua) | 1                           |
| `getPostByAnyCachedBatch` / `getRssFeedItemByIdCachedBatch` (search tools)             | cache              | MGET               | 1–2 per tool call           |
| `getTopicByAnyCachedBatch` (`compare_topics` tool)                                     | cache              | MGET               | 1 per tool call             |
| `getCachedSearchEmbedding` (semantic search tools)                                     | cache              | GET/SET            | 1 lookup; +1 write on miss  |

**Total per job:** 0–N on shared singletons (conditional on job type and tool calls); O(tokens) PUBLISH ops on the dedicated pubsub client for chat jobs only.

## Notes

- The `chat` job streams tokens via `publishChatToken` → `chatPubSub.publish`, which uses a dedicated `GlideClient` created by `createChannelPubSub` in `backend/data-stores/valkey-pubsub/channel-pubsub.mts`. This is **not** the `cacheValkeyClient` or `rateLimiterValkeyClient` singleton, so it is excluded from the shared-singleton count.
- `autotagger-post`, `autotagger-rss-feed-item`, `moderation-*`, `community-moderation-*`, `story-clustering` use only PSQL and external AI APIs — zero shared-singleton Valkey calls.
- **Conditional:** `story-post` jobs that successfully generate a summary call `updateStoryPostAgentResult` → `invalidate.posts(postId)` = 1 `invokeScript` op on `cacheValkeyClient`.
- `hasRssFeedItemEmbedding` in the autotagger path is a PSQL query, not a Valkey call.
