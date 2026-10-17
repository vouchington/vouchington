# Valkey Requests — crawl-browser

Application-level Valkey calls issued **per job** on the shared singleton
clients. Excludes glide-mq stream ops (XADD/XREADGROUP/XACK on the worker's own
connections). See `predecessor-issue#4717`.

| Call site (service / file)                                                     | Client | Operation | Calls / job |
| ------------------------------------------------------------------------------ | ------ | --------- | ----------- |
| `services/urls-domains-robots` → `fetchRobotsTxtCached` (via `isUrlCrawlable`) | cache  | get       | 1–3         |
| `fetchRobotsTxtCached` cache miss → `ValkeyCache.set` (first crawl for domain) | cache  | set       | 0–1         |

**Total per job:** 1 cache `get` on a rules hit; 2 `get`s and no write on a marker hit; 2 `get`s and 1 `set` after a reachable fetch; 3 `get`s and 0–1 marker `set` after an unreachable fetch (a concurrently stored rules body skips the write).

## Notes

- `processBrowserCrawl` calls `isUrlCrawlable`, which reads the rules key and then the unreachable marker on a rules miss. A marker hit returns immediately. Only a miss on both keys fetches robots.txt and checks the domain blacklist; an unreachable fetch rereads the rules key before deciding whether to write the marker.
- Unlike the `crawler` worker, the browser crawl path does **not** go through `assertUrlAllowedByWebRisk` or `getDomainRateLimitRemainingMs`, so there are no rate-limiter client ops.
