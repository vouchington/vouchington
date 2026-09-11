# Valkey Requests — crawl-hostnames

Application-level Valkey calls issued **per job** on the shared singleton
clients. Excludes glide-mq stream ops (XADD/XREADGROUP/XACK on the worker's own
connections). See [issue #4717](https://github.com/jonathanong/filaments/issues/4717).

| Job / call path                                                                                                       | Client | Operation    | Calls / job |
| --------------------------------------------------------------------------------------------------------------------- | ------ | ------------ | ----------- |
| `crawl_urls_per_hostname_dispatcher` → `dispatchCrawlUrlsPerHostname` → `fetchRobotsTxtCached`                        | cache  | get          | 0–1         |
| `crawl_urls_per_hostname_dispatcher` → `fetchRobotsTxt` → `checkDomainBlacklisted` (robots cache miss only)           | bloom  | invokeScript | 0–1         |
| `crawl_urls_per_hostname_dispatcher` → `dispatchCrawlUrlsPerHostname` → `fetchRobotsTxtCached` (successful miss only) | cache  | set          | 0–1         |
| `crawl_tier1_dispatcher` / `crawl_tier2_dispatcher` → `fetchRobotsTxtCached`                                          | cache  | get          | 0–N         |
| `crawl_tier1_dispatcher` / `crawl_tier2_dispatcher` → `fetchRobotsTxt` → `checkDomainBlacklisted` (cache miss only)   | bloom  | invokeScript | 0–N         |
| `crawl_tier1_dispatcher` / `crawl_tier2_dispatcher` → `fetchRobotsTxtCached` (successful miss only)                   | cache  | set          | 0–N         |
| `refresh_hostname_crawler` → `computeRateLimitForHostname` → `computeHostnameRateLimitMs` → `fetchRobotsTxtCached`    | cache  | get          | 0–1         |
| `refresh_hostname_crawler` → `fetchRobotsTxt` → `checkDomainBlacklisted` (robots cache miss only)                     | bloom  | invokeScript | 0–1         |
| `refresh_hostname_crawler` → `computeRateLimitForHostname` → `fetchRobotsTxtCached` (successful miss only)            | cache  | set          | 0–1         |

`crawl_hostnames_dispatcher`, `crawl_cleanup`, and `refresh_hostname_crawler_dispatcher` issue exactly 0 application-level Valkey calls per job.

## Notes

- `dispatchCrawlUrlsPerHostname` issues no Valkey call when the hostname is absent, blocked, or not crawlable. An eligible hostname issues 1 cache `get`; a miss additionally issues 1 bloom-client `invokeScript`, then 1 cache `set` only when the robots load succeeds.
- Tier dispatchers group selected URLs by hostname within each cursor batch. They issue one cache `get` and, on a miss, one bloom-client `invokeScript` per hostname group. A successful robots load then issues one cache `set`, for 0–N calls of each kind across all hostname groups and batches. The same hostname can therefore be checked again when its URLs span batches.
- `refresh_hostname_crawler` computes a hostname rate limit only when the refresh returns URLs to crawl, so it issues 0–1 cache `get`; a miss adds 0–1 bloom-client `invokeScript`, followed by 0–1 cache `set` only when the robots load succeeds.
