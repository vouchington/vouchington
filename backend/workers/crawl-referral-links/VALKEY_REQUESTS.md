# Valkey Requests — crawl-referral-links

Application-level Valkey calls issued **per job** on the shared singleton
clients. Excludes glide-mq stream ops (XADD/XREADGROUP/XACK on the worker's own
connections). See [issue #4717](https://github.com/jonathanong/filaments/issues/4717).

| Call site (service / file)                                                                         | Client       | Operation          | Calls / job |
| -------------------------------------------------------------------------------------------------- | ------------ | ------------------ | ----------- |
| `services/crawls/domain-rate-limit` → `getDomainRateLimitRemainingMs` (fetch path)                 | rate-limiter | pttl               | 1           |
| `services/web-risk/state` → `isLocallyRateLimited` (minute + month windows, fetch path)            | rate-limiter | invokeScript (Lua) | 1           |
| `services/urls-domains-blacklist/bloom-filter` → `checkBloomFilter` / `existsIfReady` (fetch path) | cache        | invokeScript (Lua) | 1           |
| `services/urls-domains-robots` → `fetchRobotsTxtCached` (fetch path)                               | cache        | get                | 1           |

**Total per job:** 0 for automation-type jobs (delegates to `crawl-browser`); ~4 fixed ops (2 rate-limiter + 2 cache) for fetch-path jobs

## Notes

- `crawl_referral_link` jobs with `crawler_type = 'automation'` immediately enqueue a `crawl-browser` job and return — no Valkey calls in that path.
- For fetch-path jobs, `crawlUrl` is called, which runs the same preflight as the `crawler` worker: domain rate-limit `pttl`, Web Risk local limiter script (1 rate-limiter op), URL blocklist bloom `existsIfReady` (1 cache op), and robots.txt `ValkeyCache.get` (1 cache op).
- If web-risk is disabled or the clean-verdict cache is warm, the Web Risk local limiter op may be skipped. See `services/web-risk/state.mts`.
- **Conditional:** When web-risk is enabled and no cached clean verdict exists, `assertUrlAllowedByWebRisk` reads the clean-verdict key, checks the provider cooldown key, and writes the clean-verdict key after a clean response — up to 3 more `rateLimiterValkeyClient` ops, same as the `crawler` worker.
- The dispatcher job (`crawl_referral_links_dispatcher`) is PSQL-only with no Valkey calls.
- **Conditional:** Fetch-path jobs with HTTP redirects or distinct canonical URLs call `addUrl()` → `assertUrlAllowedByWebRisk()` (1 more rate-limiter op) + `invalidate.urls(urlId)` (1 cache op), same as the `crawler` worker. Fetch-path redirect crawls can exceed ~4 fixed ops.
