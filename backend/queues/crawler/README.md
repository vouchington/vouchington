# Crawler System

Handles individual URL crawl jobs.

See [Crawling Architecture](../../../docs/overview/architecture/crawling.md) for the routing and exclusivity model, plus the full crawl pipeline.

## Queue Configuration

### Queues

- `crawl_urls` - Individual URL crawl execution
  - `crawl_url` - Crawls a single URL and stores the result through the crawl service
  - **Lock duration**: 120,000 ms (2 min); stalled interval: 30,000 ms (default)

### Queue-Local Behavior

- On fetch/host crawl failure, enqueues alternative URLs from the same hostname as retry candidates
- Local persistence and S3 upload failures use the job's bounded retry budget without fan-out
- Successful jobs return only a small crawl reference (`url_id`, `crawl_id`, `response_status_code`) to GlideMQ; the full crawl row remains in PostgreSQL and raw HTML remains in S3
- 429 rate-limit errors with `Retry-After` are re-enqueued with the server-specified delay instead of using generic exponential backoff
- `Retry-After: 0` re-enqueues the original job with no per-job delay, but the crawler still sets a 1s per-hostname Valkey lock so subsequent same-hostname jobs may defer briefly in preflight
- Rate limiting is enforced per-hostname using glide-mq's `ordering.rateLimit` (not per-job `delay`), with the effective delay computed from `url_hostnames.requests_per_second_limit` and the domain's `Crawl-delay` (whichever is larger)

## Service Modules

Business logic extracted from this system lives in:

- `@services/crawls/retry-candidates` — `getRetryCrawlUrlCandidates(urlId)`: finds retry URL candidates from the same hostname
- `@services/crawls/hostname-rate-limit` — `computeRateLimitForHostname(hostnameId)`: computes the crawl rate limit in ms

## Related

- Parent: [../CLAUDE.md](../CLAUDE.md)
- Crawling overview: [../../../docs/overview/architecture/crawling.md](../../../docs/overview/architecture/crawling.md)
- [Crawlers Service](../../services/crawlers/README.md) — crawler management and scheduling
- Hostname dispatch: `@queues/crawl-hostnames`
- Boilerplate removal: `@queues/crawl-boilerplate-removal`
