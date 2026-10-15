# Valkey Requests — content-analysis

Application-level Valkey calls issued **per job** on the shared singleton
clients. Excludes glide-mq stream ops (XADD/XREADGROUP/XACK on the worker's own
connections). See `predecessor-issue#4717`.

| Call site (service / file)                                                 | Client | Operation          | Calls / job |
| -------------------------------------------------------------------------- | ------ | ------------------ | ----------- |
| `detectPostLanguage` → `invalidate.posts(id)` (post entities)              | cache  | invokeScript (Lua) | 1           |
| `detectRssFeedItemLanguage` → `invalidate.rss_feed_items(id)` (feed items) | cache  | invokeScript (Lua) | 1           |
| `detectUserLanguage` → `invalidate.users(id)` (user entities)              | cache  | invokeScript (Lua) | 1           |
| `detectTopicLanguage` → `invalidate.topics(id)` (topic entities)           | cache  | invokeScript (Lua) | 1           |

**Total per job:** 1 (cache)

## Notes

- Language detection itself is pure CPU via a native libuv thread pool library. After writing the detected language to PSQL, each detector calls `invalidate.*` on the relevant entity cache.
- The op count is 1 for each entity type dispatched per job. Posts, users, and topics batch related cache instances into one script call; rss_feed_items is already a single-cache invalidation. All calls land on `cacheValkeyClient`.

`staydown-hash` and `cleanup-abandoned-uploads` use S3/PostgreSQL but make no application-level
Valkey calls; the cleanup job enqueues upload recovery on `image-uploads`.
