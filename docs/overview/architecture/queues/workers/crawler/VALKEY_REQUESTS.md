# Valkey Requests — crawler

Application-level Valkey calls issued **per job** on the shared singleton
clients. Excludes glide-mq stream ops (XADD/XREADGROUP/XACK on the worker's own
connections). See `predecessor-issue#4717`.

| Call site (service / file)                                                            | Client       | Operation          | Calls / job |
| ------------------------------------------------------------------------------------- | ------------ | ------------------ | ----------- |
| `services/crawls/domain-rate-limit` → `getDomainRateLimitRemainingMs`                 | rate-limiter | pttl               | 1           |
| `services/web-risk/state` → `isLocallyRateLimited` (minute + month windows)           | rate-limiter | invokeScript (Lua) | 1           |
| `services/urls-domains-blacklist/bloom-filter` → `checkBloomFilter` / `existsIfReady` | cache        | invokeScript (Lua) | 1           |
| `services/urls-domains-robots` → `fetchRobotsTxtCached`                               | cache        | get                | 1           |

**Total per job:** ~4 fixed ops (2 rate-limiter + 2 cache)

## Notes

- All 4 ops fire on the `crawl_url` job path via `crawlUrl` → `loadCrawlPreflight`.
- `getDomainRateLimitRemainingMs` issues a `pttl` on rate-limiter. If the domain is currently rate-limited the job throws `CrawlerRateLimitError` before the web-risk calls.
- `assertUrlAllowedByWebRisk` → `isLocallyRateLimited` issues 1 `invokeScript` op that checks both minute and month Web Risk windows. If web-risk is disabled via env or the URL passes bloom/clean-verdict checks early, later ops are skipped.
- **Conditional:** When web-risk is enabled and no cached clean verdict exists, `assertUrlAllowedByWebRisk` additionally reads the clean-verdict key, checks the provider cooldown key, and writes the clean-verdict key after a clean response — up to 3 more `rateLimiterValkeyClient` ops (`get`/`pttl`/`set` variants), bringing the rate-limiter total to up to 5 ops for uncached URLs.
- `checkBloomFilter` (`existsIfReady`) on the URL blocklist bloom filter lands on cache client. On a cache miss in `fetchRobotsTxtCached` a `set` is also issued, adding 1 more cache op.
- On rate-limit errors from the crawled site, `setDomainRateLimitedBackground` fires `invokeScript(setDomainRateLimitScript)` on rate-limiter as a background fire-and-forget — not counted above since it is not on the hot path of every job.
- **Conditional:** Jobs with HTTP redirects or distinct canonical URLs call `addUrl()` → `assertUrlAllowedByWebRisk()` (1 more rate-limiter op) + `invalidate.urls(urlId)` (1 cache op) for each redirect/canonical URL processed. Redirect-heavy crawl jobs can exceed ~4 fixed ops significantly.
