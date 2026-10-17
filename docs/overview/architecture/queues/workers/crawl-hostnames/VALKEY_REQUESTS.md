# Valkey Requests — crawl-hostnames jobs on crawl-dispatch

Application-level Valkey calls issued **per job** on the shared singleton
clients. Excludes glide-mq stream ops (XADD/XREADGROUP/XACK on the worker's own
connections). See `predecessor-issue#4717`.

| Job / call path                                                                                                                  | Client | Operation    | Calls / job |
| -------------------------------------------------------------------------------------------------------------------------------- | ------ | ------------ | ----------- |
| `crawl_urls_per_hostname_dispatcher` → `dispatchCrawlUrlsPerHostname` → `fetchRobotsTxtCached`                                   | cache  | get          | 0–3         |
| `crawl_urls_per_hostname_dispatcher` → `fetchRobotsTxt` → `checkDomainBlacklisted` (rules and marker miss only)                  | bloom  | invokeScript | 0–1         |
| `crawl_urls_per_hostname_dispatcher` → `dispatchCrawlUrlsPerHostname` → `fetchRobotsTxtCached` (fetch without a raced rules hit) | cache  | set          | 0–1         |
| `crawl_tier1_dispatcher` / `crawl_tier2_dispatcher` → `fetchRobotsTxtCached`                                                     | cache  | get          | 0–3N        |
| `crawl_tier1_dispatcher` / `crawl_tier2_dispatcher` → `fetchRobotsTxt` → `checkDomainBlacklisted` (rules and marker miss only)   | bloom  | invokeScript | 0–N         |
| `crawl_tier1_dispatcher` / `crawl_tier2_dispatcher` → `fetchRobotsTxtCached` (fetch without a raced rules hit)                   | cache  | set          | 0–N         |
| `refresh_hostname_crawler` → `computeRateLimitForHostname` → `computeHostnameRateLimitMs` → `fetchRobotsTxtCached`               | cache  | get          | 0–3         |
| `refresh_hostname_crawler` → `fetchRobotsTxt` → `checkDomainBlacklisted` (rules and marker miss only)                            | bloom  | invokeScript | 0–1         |
| `refresh_hostname_crawler` → `computeRateLimitForHostname` → `fetchRobotsTxtCached` (fetch without a raced rules hit)            | cache  | set          | 0–1         |

`crawl_hostnames_dispatcher`, `crawl_cleanup`, and `refresh_hostname_crawler_dispatcher` issue exactly 0 application-level Valkey calls per job.

## Notes

- `dispatchCrawlUrlsPerHostname` issues no Valkey call when the hostname is absent, blocked, or not crawlable. An eligible hostname uses 1 cache `get` on a rules hit, 2 `get`s on a marker hit, 2 `get`s plus 1 `set` after a reachable fetch, or 3 `get`s plus 0–1 `set` after an unreachable fetch. The last path rereads rules and skips the marker write if a rules body appeared concurrently. Only a miss on both rules and marker keys calls the blacklist Bloom lookup (0–1 command when enabled).
- Tier dispatchers group selected URLs by hostname within each cursor batch. Each hostname group follows those same branches: 1–3 cache `get`s, 0–1 cache `set`, and 0–1 Bloom command. Across N hostname groups, that is up to 3N reads and N writes or Bloom commands. The same hostname can be checked again when its URLs span batches.
- `refresh_hostname_crawler` computes a hostname rate limit only when the refresh returns URLs to crawl. Each computed rate limit follows the same branches above; jobs without URLs issue no robots cache or Bloom calls.
