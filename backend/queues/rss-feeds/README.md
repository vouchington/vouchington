# RSS Feeds

See [Crawling Architecture](../../../docs/overview/architecture/crawling.md) for the dispatcher/fetch/tier-refresh flow.
For RSS feed business logic and acceptance criteria, see [../../services/rss-feeds/README.md](../../services/rss-feeds/README.md).

## Queue Configuration

### Queue: `rss-feeds`

One queue with two ordering groups:

- **`dispatcher` ordering group** (`dispatchRssFeeds` job)
  - Scheduled every minute; searches for RSS feeds to update and bulk enqueues `fetchRssFeed` jobs into the same queue.
  - Global concurrency of 1 via `ordering.concurrency`.
  - Worker local concurrency is 10, so effective dispatcher concurrency remains 1.
- **`fetch` ordering group** (`fetchRssFeed` job)
  - A job for fetching RSS Feeds by ID.
  - Global concurrency of 5 via `ordering.concurrency`.
  - Worker local concurrency is 10, so effective fetch concurrency remains 5. No rate limit.
  - Dispatcher/background fetches use a short throttle dedup key per feed to avoid duplicate fetches within one dispatch cycle.
  - Forced/manual refreshes skip that dedup key, so a recently queued normal fetch cannot suppress the caller's explicit refresh.
  - **Permanent errors** (parse failure, invalid content type, persistent 4xx) soft-delete the feed inline and rethrow; transient errors retry via `attempts: 3` with exponential backoff. Classification in [`services/rss-feeds/is-permanent-fetch-error.mts`](../../services/rss-feeds/is-permanent-fetch-error.mts).

## Tiering And Refresh

The tiered SLA policy, `mv_rss_feed_crawl_tiers`, and the 01:00 UTC refresh job are owned by the psql queue. This queue consumes the tiered results when dispatching feeds; it does not recalculate follower demand or provide a paid/manual bypass. The scheduler and view refresh logic are documented in the architecture overview and the RSS feed crawling requirements.

## Related

- Service: [../../services/rss-feeds/README.md](../../services/rss-feeds/README.md)
- RSS Feed Items: [../../services/rss-feed-items/README.md](../../services/rss-feed-items/README.md)
- Crawling spec: [../../../docs/requirements/content/RSS-FEED-CRAWLING.md](../../../docs/requirements/content/RSS-FEED-CRAWLING.md)
- Parent: [../CLAUDE.md](../CLAUDE.md)
