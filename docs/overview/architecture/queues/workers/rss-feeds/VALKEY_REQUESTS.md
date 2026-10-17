# Valkey Requests — rss-feeds

Application-level Valkey calls issued **per job** on the shared singleton
clients. Excludes glide-mq stream ops (XADD/XREADGROUP/XACK on the worker's own
connections). See `predecessor-issue#4717`.

| Call site (service / file)                                                                      | Client       | Operation            | Calls / job   |
| ----------------------------------------------------------------------------------------------- | ------------ | -------------------- | ------------- |
| `assertRssFetchHostnameNotRateLimited` → `getDomainRateLimitRemainingMs`                        | rate-limiter | pttl                 | 1             |
| `assertUrlAllowedByWebRisk` → `getHostnamePolicy` → `checkBloomFilters` (every hostname suffix) | bloom        | mexistsIfReady (Lua) | 1             |
| `checkRssFeedCrawlable` → `fetchRobotsTxtCached`                                                | cache        | get                  | 1             |
| `upsertRssFeedItems` → `entityCacheBloomFilters.rss_feed_items.add` (per 5k chunk)              | bloom        | BF.MADD (Lua)        | O(items/5k)   |
| `upsertRssFeedItems` → `invalidate.rss_feed_items` (per 1000 ids)                               | cache        | invokeScript (Lua)   | O(items/1000) |
| `persistRssFeedCrawlAndMetadata` → `updateRssFeedById` → `invalidate.rss_feeds`                 | cache        | invokeScript (Lua)   | 1             |

**Total per job:** 1 rate-limiter `pttl` + 1 bloom `mexistsIfReady` + 1 cache `get` + 1 cache `invalidate.rss_feeds`, plus O(items/5k) bloom adds and O(items/1000) item-cache invalidations when the fetch upserts items.

## Notes

- `getDomainRateLimitRemainingMs` runs on every crawlable fetch, before Web Risk. A positive TTL throws `CrawlerRateLimitError` and skips the later calls.
- The hostname policy read sends every hostname suffix (`www.example.com`, `example.com`, `com`, …) in one `mexistsIfReady` on `bloomValkeyClient`, concurrently with the local hostname read, when `bloom-filter-config.urlBlocklistBloomFilterEnabled` is on. A negative for every suffix skips the blocklist table. A missing filter or any possible hit adds one `blocklisted_domains` read. With the flag off there is no Bloom command.
- Robots.txt uses 1 cache `get` on a rules hit. A marker hit uses 2 cache `get`s and skips the blacklist lookup and cache write. Only a miss on both keys calls `checkDomainBlacklisted` (one `mexistsIfReady` when enabled): a reachable fetch uses 2 cache `get`s and 1 rules `set`; an unreachable fetch uses 3 cache `get`s, including a rules reread, and 1 marker `set` only when no rules body appeared concurrently. `ignoreRobotsRules` calls `checkDomainBlacklisted` directly without reading the robots cache.
- Item bloom adds use `entityCacheBloomFilters.rss_feed_items.add`, which absorbs errors and chunks BF.MADD at 5k items on `bloomValkeyClient`. Item cache invalidation is one cache script per 1000 ids.
- Web Risk is off unless `web-risk-config.enabled` is set. When it is on and no cached clean verdict exists, `assertUrlAllowedByWebRisk` can add one pipelined clean-verdict `get` plus cooldown `pttl` (a single `Batch`, concurrent with the policy read), one combined minute+month `invokeScript`, and a clean-verdict `set` on `rateLimiterValkeyClient`.
