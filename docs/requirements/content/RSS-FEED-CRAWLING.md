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
- **Paged dispatch gives due feeds capacity before backfill.** A run freezes its eligibility time
  and walks due tiers before backfill tiers, using the immutable feed ID within each lane. Mutable
  deadlines and scores do not form continuation keys. A view refresh can move a feed between lanes
  during a stalled run; the next scheduled run reconsiders it. The run budget survives continuation.
- **A failed crawl remains eligible on a fresh sweep.** Retained failed jobs can be replaced
  when a dispatcher needs the same feed again. Reactivation conditionally removes that terminal
  record through GlideMQ; a concurrent retry wins and leaves the live job intact. The original
  page's admission fence still prevents replay from admitting the feed twice.
- **Explicit refreshes are never dropped** behind a queued normal fetch: requested and forced
  fetches carry their own dedup behavior.
- **Conditional GET is withheld when no replayable crawl body remains**, because a 304 would
  otherwise starve item updates after the crawl history partition is dropped.

## Related

- [RSS feeds queue](../../overview/architecture/queues/README.md)
- [Partition retention](../../overview/architecture/partitioning-strategy.md)
