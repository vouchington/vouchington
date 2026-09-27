# Valkey Requests — crawl-browser

Application-level Valkey calls issued **per job** on the shared singleton
clients. Excludes glide-mq stream ops (XADD/XREADGROUP/XACK on the worker's own
connections). See `predecessor-issue#4717`.

| Call site (service / file)                                                     | Client | Operation | Calls / job |
| ------------------------------------------------------------------------------ | ------ | --------- | ----------- |
| `services/urls-domains-robots` → `fetchRobotsTxtCached` (via `isUrlCrawlable`) | cache  | get       | 1           |
| `fetchRobotsTxtCached` cache miss → `ValkeyCache.set` (first crawl for domain) | cache  | set       | 0–1         |

**Total per job:** 1–2 (cache, conditional on robots.txt cache hit)

## Notes

- `processBrowserCrawl` calls `isUrlCrawlable` which reads the robots.txt from `ValkeyCache` (1 `get` op). On a cache miss it fetches the robots.txt over HTTP and stores it with a 24h TTL (`set`), adding 1 more op on first fetch for a given domain.
- Unlike the `crawler` worker, the browser crawl path does **not** go through `assertUrlAllowedByWebRisk` or `getDomainRateLimitRemainingMs`, so there are no rate-limiter client ops.
