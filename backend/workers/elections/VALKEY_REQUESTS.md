# Valkey Requests — elections

Application-level Valkey calls issued **per job** on the shared singleton
clients. Excludes glide-mq stream ops (XADD/XREADGROUP/XACK on the worker's own
connections). See [issue #4717](https://github.com/jonathanong/filaments/issues/4717).

| Call site (service / file)                                                                                                                                                  | Client | Operation          | Calls / job |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ------------------ | ----------- |
| `invalidate.topic_elections` / `invalidate.post_elections` / `invalidate.hostname_elections` / `invalidate.rss_feed_item_elections` (one per job, depending on entity type) | cache  | invokeScript (Lua) | 1           |

**Total per job:** 1 (cache); 2 (cache) for rss_feed_item ordering-key jobs

## Notes

- Each job targets one entity type. The correct `invalidate.*` call is dispatched based on the entity type, each costing 1 `invokeScript` op on the cache client.
- `invalidate.topic_elections`, `invalidate.post_elections`, `invalidate.hostname_elections` each correspond to a single-instance cache, hence 1 op each.
- **Exception:** `rss_feed_item` ordering key jobs call both `invalidate.rss_feed_item_elections(id)` (1 op) AND `invalidate.rss_feed_items(id)` (1 op) = **2 ops** for RSS feed item election jobs.
