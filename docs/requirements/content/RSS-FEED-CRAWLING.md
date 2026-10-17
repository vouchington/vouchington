# RSS Feed Crawling

Prioritized, tiered crawl scheduling for RSS feeds. Tier cutoffs, SLAs, and the dispatch budget are
read from the view SQL and the `rss-feed-crawl-config` DynamicConfig key.

## Decisions

- **Priority is relative, not a promise.** Every enabled feed is crawled periodically, and
  following a feed improves its relative priority. It is not a public or guaranteed crawl SLA;
  capacity, percentile tiers, queue priority, and dispatcher policy remain the scheduling authority.
- **The score and tiers are baked into a materialized view.** Computing the percentile once at
  refresh time, never per dispatch, keeps the dispatcher cheap. The score dampens very large
  follower counts, and follower counts route through the canonical feed so a redirected feed's
  followers credit the enabled one, counted once per user.
- **Paid followers weigh more**, only while the membership is current, and entitlement lifecycle is
  decided by the shared current-paid-memberships view so tier selection cannot fan out demand.
- **New feeds default to the lowest tier** and are still dispatched, so a fresh feed is never missed
  before the next view refresh.
- **Explicit refreshes are never dropped** behind a queued normal fetch: requested and forced
  fetches carry their own dedup behavior.
- **Conditional GET is withheld when no replayable crawl body remains**, because a 304 would
  otherwise starve item updates after the crawl history partition is dropped.

## Related

- [RSS feeds queue](../../overview/architecture/queues/rss-feeds/README.md)
- [Partition retention](../../overview/architecture/partitioning-strategy.md)
