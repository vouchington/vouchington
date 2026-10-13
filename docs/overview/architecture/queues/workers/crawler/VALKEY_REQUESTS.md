# Valkey Requests — crawler

Application-level Valkey calls issued **per job** on the shared singleton
clients. Excludes glide-mq stream ops (XADD/XREADGROUP/XACK on the worker's own
connections). See `predecessor-issue#4717`.

| Call site (service / file)                                                                  | Client       | Operation            | Calls / job |
| ------------------------------------------------------------------------------------------- | ------------ | -------------------- | ----------- |
| `loadCrawlPreflight` → `getDomainRateLimitRemainingMs`                                      | rate-limiter | pttl                 | 1           |
| `assertUrlAllowedByWebRisk` → `getHostnamePolicy` → `checkBloomFilters` (hostname suffixes) | bloom        | mexistsIfReady (Lua) | 1           |
| `isUrlCrawlable` → `fetchRobotsTxtCached`                                                   | cache        | get                  | 1           |

**Total per job:** 1 rate-limiter `pttl` + 1 bloom `mexistsIfReady` + 1 cache `get` when Web Risk is off and robots.txt is cached.

## Notes

- Those three calls run on every `crawl_url` job through `crawlUrl` → `loadCrawlPreflight`, unless an earlier check returns.
- `getDomainRateLimitRemainingMs` issues a `pttl` on `rateLimiterValkeyClient`. A positive TTL throws `CrawlerRateLimitError` before the blocklist and robots calls. That preflight throw does not write a new lock.
- `assertUrlAllowedByWebRisk` always reads the hostname policy before the Web Risk feature check, through one shared helper. When `bloom-filter-config.urlBlocklistBloomFilterEnabled` is on, it sends every hostname suffix in one `mexistsIfReady` on `bloomValkeyClient` concurrently with the local `url_hostnames` read. Every suffix absent skips the blocklist table. A missing filter or any possible hit adds one `blocklisted_domains` read. With the flag off there is no Bloom command and one full policy query.
- Web Risk provider checks run only when `web-risk-config.enabled` is set and an API key is present. The enabled flag is an in-memory dynamic-config read, not another per-job command. The clean-verdict `get` and the cooldown `pttl` go out as one pipelined `Batch` on `rateLimiterValkeyClient`, concurrently with the policy read. A warm verdict or an active cooldown returns without more commands. A cold verdict adds one combined minute+month `invokeScript` and a clean-verdict `set`.
- Robots.txt is one cache `get` on a hit. A miss calls `checkDomainBlacklisted` (one `mexistsIfReady` of the domain on `bloomValkeyClient` when the flag is on, run concurrently with the local read), then `set`s the fetched body (1 more cache op). `ignore_robots_txt` skips `isUrlCrawlable`, so that job has no robots cache read.
- A crawled-site HTTP 429 awaits `setDomainRateLimited` (`invokeScript` of `set-domain-rate-limit.lua` on `rateLimiterValkeyClient`) inside `recordCrawlError`. That write is not on the success path. When the processor re-enqueues, `computeRateLimitForHostname` reads robots.txt from cache again.
- Redirects and distinct canonical URLs call `addUrl()` → `assertUrlAllowedByWebRisk()` (another bloom `mexistsIfReady`, plus the conditional Web Risk ops above) and `invalidate.urls` (one cache deletion script for a single changed URL). The redirect hop then repeats preflight.
