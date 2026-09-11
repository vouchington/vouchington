# Valkey Requests — rss-feed-discoverability

Application-level Valkey calls issued **per job** on the shared singleton
clients. Excludes glide-mq stream ops (XADD/XREADGROUP/XACK on the worker's own
connections). See [issue #4717](https://github.com/jonathanong/filaments/issues/4717).

| Call site (service / file) | Client | Operation          | Calls / job |
| -------------------------- | ------ | ------------------ | ----------- |
| `invalidate.rss_feeds`     | cache  | invokeScript (Lua) | 1           |

**Total per job:** 1 (cache)

## Notes

- Each job calls `invalidate.rss_feeds(ids)` = 1 `invokeScript` op on the cache client (single-instance cache).
