# Valkey Requests — crawl-browser

Application-level Valkey calls issued **per job** on the shared singleton
clients. Excludes glide-mq stream ops (XADD/XREADGROUP/XACK on the worker's own
connections). See `predecessor-issue#4717`.

| Call site (service / file)                                                     | Client | Operation | Calls / job |
| ------------------------------------------------------------------------------ | ------ | --------- | ----------- |
| `services/urls-domains-robots` → `fetchRobotsTxtCached` (via `isUrlCrawlable`) | cache  | get       | 1           |
| `fetchRobotsTxtCached` cache miss → `ValkeyCache.set` (first crawl for domain) | cache  | set       | 0–1         |

**Total per job:** 1 cache `get` on a rules hit. A rules miss adds one marker `get` and one `set`.

## Notes

- `processBrowserCrawl` calls `isUrlCrawlable` which reads the robots.txt from `ValkeyCache` (1 `get` op). On a rules miss it also reads the short unreachable marker, fetches robots.txt over HTTP, and stores either the reachable body for 24 hours or that marker.
- Unlike the `crawler` worker, the browser crawl path does **not** go through `assertUrlAllowedByWebRisk` or `getDomainRateLimitRemainingMs`, so there are no rate-limiter client ops.
