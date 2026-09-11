# Valkey Requests — rss-feeds

Application-level Valkey calls issued **per job** on the shared singleton
clients. Excludes glide-mq stream ops (XADD/XREADGROUP/XACK on the worker's own
connections). See [issue #4717](https://github.com/jonathanong/filaments/issues/4717).

| Call site (service / file)                                                            | Client       | Operation          | Calls / job |
| ------------------------------------------------------------------------------------- | ------------ | ------------------ | ----------- |
| `services/web-risk` → `isLocallyRateLimited` (minute + month windows)                 | rate-limiter | invokeScript (Lua) | 1           |
| `services/urls-domains-robots` → `fetchRobotsTxtCached`                               | cache        | get                | 1           |
| `services/urls-domains-blacklist/bloom-filter` → `checkBloomFilter` / `existsIfReady` | cache        | invokeScript (Lua) | 1           |
| `entityCacheBloomFilters.rss_feed_items.addOrThrow(items)` (per effective chunk)      | cache        | BF.MADD (Lua)      | O(items/5k) |
| `persistRssFeedCrawlAndMetadata` / `updateRssFeedById` → `invalidate.rss_feeds`       | cache        | invokeScript (Lua) | 1           |

**Total per job:** 1 rate-limiter + 3 cache fixed + O(items/5k) cache fan-out

## Notes

- The fixed rate-limiter op checks both minute and month Web Risk windows in one Lua call. Robots.txt + bloom-filter cache ops are incurred on every fetch job regardless of item count.
- The `rss_feed_items` bloom filter `addOrThrow` scales with the number of new items fetched: `valkyries` clamps Lua chunks to 5k items per BF.MADD request.
- All cache ops land on `cacheValkeyClient`; rate-limiter ops land on `rateLimiterValkeyClient`.
- **Conditional:** When web-risk is enabled and no cached clean verdict exists, `assertUrlAllowedByWebRisk` reads the clean-verdict key, checks the provider cooldown key, and writes the clean-verdict key — up to 3 more `rateLimiterValkeyClient` ops (see `services/web-risk/state.mts`).
