# Valkey Requests — kagi-smallweb

Application-level Valkey calls issued **per job** on the shared singleton
clients. Excludes glide-mq stream ops (XADD/XREADGROUP/XACK on the worker's own
connections). See `predecessor-issue#4717`.

| Call site (service / file)                                                                 | Client | Operation | Calls / job |
| ------------------------------------------------------------------------------------------ | ------ | --------- | ----------- |
| `services/kagi-smallweb/fetch-feed-list.mts` → `headerCache` ValkeyCache `get` (3 sources) | cache  | get       | 3           |
| `headerCache` ValkeyCache `set` on HTTP fetch (per changed source, up to 3)                | cache  | set       | 0–3         |

**Total per job:** 3–6 (cache; 3 get + 0–3 set based on cache freshness)

## Notes

- `syncKagiSmallWeb` fetches all 3 `FEED_LIST_SOURCES` via `fetchFeedList`. Each source issues 1 `headerCache.get`. Sources with stale/absent cache entries then fetch over HTTP and issue 1 `headerCache.set`, for up to 3 additional ops.
- All calls land on `cacheValkeyClient`.
- **Conditional:** Sync jobs that create a new RSS feed call `createRssFeedUrlId` → `addUrl` → `assertUrlAllowedByWebRisk()` (1 rate-limiter `invokeScript` op on `rateLimiterValkeyClient`) + URL blocklist bloom `existsIfReady` (1 op, cache) + robots-txt `ValkeyCache.get` (1 op, cache). Also `invalidate.urls(urlId)` = 1 `invokeScript` op (cache) after URL upsert. New-feed sync jobs add ~4 ops on top of the base header-cache total.
