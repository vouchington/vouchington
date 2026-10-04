# Crawl Hostnames System

Source entrypoint: [backend/queues/crawl-hostnames/README.md](../../../../../backend/queues/crawl-hostnames/README.md)

Handles hostname-level crawl orchestration.

See [Crawling Architecture](../../crawling.md) for the dispatcher flow and crawl routing.

## Queue Configuration

### Queues

- `crawl_hostnames` - All hostname-level crawl operations
  - `crawl_hostnames_dispatcher` - Daily 2 AM, enqueues per-hostname URL dispatch
  - `crawl_urls_per_hostname_dispatcher` - Dispatches individual URL crawls for a hostname
  - `enqueueCrawlTier1Dispatcher` - Daily 2:30 AM, requests the coalesced `crawl_tier1_dispatcher` sweep (7-day cycle)
  - `enqueueCrawlTier2Dispatcher` - Weekly Sunday 3 AM, requests the coalesced `crawl_tier2_dispatcher` sweep (30-day cycle)
  - `refresh_hostname_crawler_dispatcher` - Weekly Monday 4 AM, refreshes crawler configs
  - `refresh_hostname_crawler` - Refreshes crawler for a single hostname
  - `crawl_cleanup` - Daily 3:30 AM, deletes old invalid crawls (30-day cutoff; overall crawl retention is partition drop)

### Queue-Local Facts

- **Tier 1** (7 days): URLs with positive-vote entity relations, user profile links
- **Tier 2** (30 days): URLs with entity relations but no positive votes, not Tier 1

## Related

- Parent: [../AGENTS.md](../../../../../backend/queues/AGENTS.md)
- [Crawler System](../crawler/README.md)
- [Crawls Service](../../services/crawls/README.md)
- [Crawling Overview](../../crawling.md)
