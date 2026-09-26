# Valkey Requests — rss-feeds

Application-level Valkey calls issued **per job** on the shared singleton
clients. Excludes glide-mq stream ops (XADD/XREADGROUP/XACK on the worker's own
connections). See `predecessor-issue#4717`.

| Call site (service / file)                                                                 | Client       | Operation            | Calls / job   |
| ------------------------------------------------------------------------------------------ | ------------ | -------------------- | ------------- |
| `assertRssFetchHostnameNotRateLimited` → `getDomainRateLimitRemainingMs`                   | rate-limiter | pttl                 | 1             |
| `assertUrlAllowedByWebRisk` → `isUrlBlocked` → `checkBloomFilters` (every hostname suffix) | bloom        | mexistsIfReady (Lua) | 1             |
| `checkRssFeedCrawlable` → `fetchRobotsTxtCached`                                           | cache        | get                  | 1             |
| `upsertRssFeedItems` → `entityCacheBloomFilters.rss_feed_items.add` (per 5k chunk)         | bloom        | BF.MADD (Lua)        | O(items/5k)   |
| `upsertRssFeedItems` → `invalidate.rss_feed_items` (per 1000 ids)                          | cache        | invokeScript (Lua)   | O(items/1000) |
| `persistRssFeedCrawlAndMetadata` → `updateRssFeedById` → `invalidate.rss_feeds`            | cache        | invokeScript (Lua)   | 1             |

**Total per job:** 1 rate-limiter `pttl` + 1 bloom `mexistsIfReady` + 1 cache `get` + 1 cache `invalidate.rss_feeds`, plus O(items/5k) bloom adds and O(items/1000) item-cache invalidations when the fetch upserts items.

## Notes

- `getDomainRateLimitRemainingMs` runs on every crawlable fetch, before Web Risk. A positive TTL throws `CrawlerRateLimitError` and skips the later calls.
- `isUrlBlocked` sends every hostname suffix (`www.example.com`, `example.com`, `com`, …) in one `mexistsIfReady` on `bloomValkeyClient`. A negative for every suffix skips the blocklist table and reads only the local hostname policy. A missing filter or any possible hit falls through to PostgreSQL.
- Robots.txt is one cache `get` on a hit. A miss, or `ignoreRobotsRules`, also calls `checkDomainBlacklisted` → `checkBloomFilter` (one `existsIfReady` on `bloomValkeyClient`). A robots cache miss then `set`s the fetched body (1 more cache op).
- Item bloom adds use `entityCacheBloomFilters.rss_feed_items.add`, which absorbs errors and chunks BF.MADD at 5k items on `bloomValkeyClient`. Item cache invalidation is one cache script per 1000 ids.
- Web Risk is off unless `web-risk-config.enabled` is set. When it is on and no cached clean verdict exists, `assertUrlAllowedByWebRisk` can add a clean-verdict `get`, a cooldown `pttl`, one combined minute+month `invokeScript`, and a clean-verdict `set` on `rateLimiterValkeyClient`.
