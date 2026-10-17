# RSS Feeds

Source entrypoint: [backend/queues/rss-feeds/README.md](../../../../../backend/queues/rss-feeds/README.md)

See [Crawling Architecture](../../crawling.md) for the dispatcher/fetch/tier-refresh flow.
For RSS feed business logic and acceptance criteria, see [../../services/rss-feeds/README.md](../../services/rss-feeds/README.md).

## Queue Configuration

### Domain: `rss-feeds`

Domain `rss-feeds` of the shared [`background` queue](../background/README.md); job names are
`rss-feeds.<name>`. The fetches share a domain-wide group of 5 (the old worker concurrency); the dispatcher runs in
its own singleton lane `rss-feeds:dispatcher`, outside the group. It adds a worker baseline of five.
`WORKER_CONCURRENCY_RSS_FEEDS` no longer exists.

- **`rss-feeds.dispatchRssFeeds`** (lane `rss-feeds:dispatcher`, concurrency 1, priority 100)
  - Scheduled every minute; reads one page of due RSS feeds and bulk enqueues `rss-feeds.fetchRssFeed` jobs.
  - The page is already bounded: `getRssFeedsToFetch` reads at most the `rss-feed-crawl-config`
    `capacity_budget` feeds (default 100, ceiling 10,000), ordered by SLA deadline, so one run never
    fans out more than one budget and needs no continuation. Feeds still due run on the next tick.
- **`rss-feeds.fetchRssFeed`** (domain group `rss-feeds`, concurrency 5, no rate limit, default priority 10)
  - A job for fetching RSS Feeds by ID. A dispatcher fetch is enqueued at its feed's crawl tier priority
    (tier 1 to 5 map to priorities 1, 3, 7, 12, and 20), so a due tier-1 feed runs ahead of a backlog.
  - Dispatcher/background fetches use a `simple` dedup key per feed (`rss-feed__<rssFeedId>`): a feed whose fetch job is still waiting, active, or retrying is not queued again, and it is admitted again once that job completes or fails. A backlogged feed is therefore queued once, not once per dispatch tick. A fetch someone requests now (a non-forced administrator refresh, a redirect's canonical feed, a newly created feed) uses its own `rss-feed-request__<rssFeedId>` key, so a low-priority backlog job never swallows it.
  - Forced/manual refreshes skip that dedup key, so a recently queued normal fetch cannot suppress the caller's explicit refresh.
  - **Permanent errors** (parse failure, invalid content type, persistent 4xx) soft-delete the feed inline and rethrow; transient errors retry via `attempts: 3` with exponential backoff. Classification in [`services/rss-feeds/is-permanent-fetch-error.mts`](../../../../../backend/services/rss-feeds/is-permanent-fetch-error.mts).

## Tiering And Refresh

The tiered SLA policy, `mv_rss_feed_crawl_tiers`, and the 01:00 UTC refresh job are owned by the psql queue. This queue consumes the tiered results when dispatching feeds; it does not recalculate follower demand or provide a paid/manual bypass. The scheduler and view refresh logic are documented in the architecture overview and the RSS feed crawling requirements.

## Related

- Service: [../../services/rss-feeds/README.md](../../services/rss-feeds/README.md)
- RSS Feed Items: [../../services/rss-feed-items/README.md](../../services/rss-feed-items/README.md)
- Crawling spec: [../../../docs/requirements/content/RSS-FEED-CRAWLING.md](../../../../requirements/content/RSS-FEED-CRAWLING.md)
- Parent: [../AGENTS.md](../../../../../backend/queues/AGENTS.md)
