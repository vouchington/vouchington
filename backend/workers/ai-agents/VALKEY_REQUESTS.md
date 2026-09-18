# Valkey Requests — ai-agents

Application-level Valkey calls issued **per job** on the shared singleton
clients. Excludes glide-mq stream ops (XADD/XREADGROUP/XACK on the worker's own
connections). See `predecessor-issue#4717`.

| Call site (service / file)                                                                   | Client             | Operation          | Calls / job                  |
| -------------------------------------------------------------------------------------------- | ------------------ | ------------------ | ---------------------------- |
| `process-chat.mts` → `publishChatToken` (chat job only)                                      | pubsub (dedicated) | PUBLISH            | O(tokens) per chat response  |
| `process-agent-response.mts` / `streamResearchResponse` → `publishAgentResponseEvent`        | pubsub (dedicated) | PUBLISH            | O(events) per agent response |
| `updateStoryPostAgentResult` → `invalidate.posts(postId)` (story-post job, on success)       | cache              | invokeScript (Lua) | 1                            |
| `getPostByAnyCachedBatch` / `getRssFeedItemByIdCachedBatch` (customer-support, search tools) | cache              | MGET               | 1–2 per tool call            |
| `getTopicByAnyCachedBatch` (`compare_topics` tool)                                           | cache              | MGET               | 1 per tool call              |
| `getCachedSearchEmbedding` (semantic search tools)                                           | cache              | GET/SET            | 1 lookup; +1 write on miss   |

**Total per job:** 0–N on shared singletons (conditional on job type and tool calls); O(tokens) PUBLISH ops on dedicated pubsub client (chat jobs only); O(events) PUBLISH ops on dedicated pubsub client (agent-response jobs only)

## Notes

- The `chat` job streams tokens via `publishChatToken` → `chatPubSub.publish`, which uses a dedicated `GlideClient` created by `createChannelPubSub` in `backend/data-stores/valkey-pubsub/channel-pubsub.mts`. This is **not** the `cacheValkeyClient` or `rateLimiterValkeyClient` singleton, so it is excluded from the shared-singleton count.
- The `agent-response` job publishes progress and terminal `done`/`error` events via `publishAgentResponseEvent` → `agentResponsePubSub.publish`, also through a dedicated `createChannelPubSub` client. The API stream reattaches from Postgres snapshots; pub/sub is only live fanout.
- `autotagger-post`, `autotagger-rss-feed-item`, `moderation-*`, `community-moderation-*`, `story-clustering` use only PSQL and external AI APIs — zero shared-singleton Valkey calls.
- **Conditional:** `wikipedia-recommender`-type jobs dispatched to the `ai_agents` queue call `processWikipediaRecommender` → `recommendTopicsForContent` → `createRecommendation` → `entityCacheBloomFilters.posts.add(...)` = 1 BF.MADD op on `cacheValkeyClient` for successful recommendations.
- **Conditional:** `story-post` jobs that successfully generate a summary call `updateStoryPostAgentResult` → `invalidate.posts(postId)` = 1 `invokeScript` op on `cacheValkeyClient`.
- **Conditional:** `customer-support` and `agent-response` jobs where the model invokes search tools call `getPostByAnyCachedBatch` / `getRssFeedItemByIdCachedBatch` = 1–2 MGET-style reads on `cacheValkeyClient` per tool call.
- **Conditional:** `agent-response` jobs where the model invokes `compare_topics` call `getTopicByAnyCachedBatch` = 1 MGET-style read on `cacheValkeyClient` per tool call.
- **Conditional:** `customer-support` and `agent-response` jobs where the model invokes semantic search tools or passes semantic inputs call `getCachedSearchEmbedding` = 1 cache lookup on `cacheValkeyClient`, plus 1 cache write when the normalized embedding query misses.
- `hasRssFeedItemEmbedding` in the autotagger path is a PSQL query, not a Valkey call.
