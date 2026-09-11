# RSS Feed Crawling

Prioritized, tiered crawl scheduling for RSS feeds.

## Background

All enabled RSS feeds are eligible for periodic crawling. Without prioritization every feed is
treated equally, so a feed followed by thousands of users gets the same cadence as one with zero
followers. Tiered crawling assigns each feed a target fetch-SLA based on its relative importance.
The dispatcher prioritizes feeds that are past their SLA, then backfills with not-yet-due feeds up
to the capacity budget.

## Crawl Score and Tiers (materialized view)

`mv_rss_feed_crawl_tiers` precomputes, per enabled feed, the crawl score **and** tier:

```
crawl_score = log1p(weighted_follower_count) + votes_score_net
crawl_tier  = percentile bucket of crawl_score (1 = highest)
```

The score formula and the percentile thresholds are **baked into the materialized-view SQL**
(`backend/data-stores/psql/views/2026-05-07-rss-feed-crawl-inputs.sql`) so that `CUME_DIST()`
runs once at refresh time, never per dispatch. `log1p` dampens very large follower counts. Follower
counts are routed through `canonical_rss_feed_id` so a permanently-redirected feed's followers
credit the enabled canonical feed. A user who follows both an alias and its canonical feed is counted
once. The private weight per unique follower is Free = 1, Plus = 2, and Pro = 3. Paid weighting
applies only while the membership is otherwise current: `active` or `past_due`, not deleted/cancelled/
expired/paused. Expiry is source-specific: direct provider sources follow the provider-authoritative
terminal lifecycle, so a stale `expires_at` or billing-period end alone does not revoke access;
time-bounded administrator grants and family entitlements require `expires_at` to be absent or in the
future. The shared
`view_current_paid_memberships` view chooses at most one current plan per user, preferring Pro,
so membership lifecycle and tier selection cannot fan out follower demand. Changes take effect at
the next nightly view refresh.

Following a feed improves its **relative** crawl priority. It is not a public or guaranteed crawl
SLA; capacity budget, percentile tiers, queue priority, and dispatcher policy remain the scheduling
authority.

| Tier | Percentile cutoff | Default fetch SLA |
| ---- | ----------------- | ----------------- |
| 1    | top 0.1%          | 5 minutes         |
| 2    | top 1%            | 15 minutes        |
| 3    | top 5%            | 1 hour            |
| 4    | top 20%           | 2 hours           |
| 5    | remainder         | 24 hours          |

A unique index on `rss_feed_id` allows `REFRESH MATERIALIZED VIEW CONCURRENTLY` so reads are not
blocked during refresh.

## Refreshing the view

The materialized view is refreshed by the **psql queue's generic `refreshMaterializedView` job**
(`backend/queues/psql`), scheduled nightly at 01:00 UTC (`refresh-rss-feed-crawl-tiers`). The job
takes `{ viewName }` and is allow-listed in
`backend/data-stores/psql/migration-runner/refresh-materialized-view.mts`. There is no bespoke
re-tier job on the `rss-feeds` queue.

## Dispatcher

`processRssFeedsDispatcher` runs every minute and calls `getRssFeedsToFetch()`:

- **Tiered mode** (`enabled = true`): `LEFT JOIN mv_rss_feed_crawl_tiers` to read each feed's
  `crawl_tier`/`crawl_score`.
  - **Due bucket**: feeds whose `last_fetched_at` is older than their tier SLA, ordered by
    `crawl_score DESC, id ASC`.
  - **Backfill bucket**: not-yet-due feeds that were last fetched at least the tier-1 SLA ago,
    ordered by time-until-deadline ASC then `crawl_score DESC` — fills spare capacity up to
    `capacity_budget` (default 100).
  - **New feeds** not yet in the view default to **tier 5** (`COALESCE(crawl_tier, 5)`) and are
    still dispatched, so a freshly created feed is never missed before the next nightly refresh.
- **Flat fallback** (`enabled = false`): all enabled feeds past a single TTL, oldest first, up to
  `limit`.

Feeds are grouped by `crawl_tier` and enqueued with matching glide-mq priority constants
(`TIER_PRIORITY` in `backend/queues/rss-feeds/config.mts`): tier 1 -> priority 1, tier 5 -> priority 20. Backfill feeds omit the per-tier SLA TTL (so they are not throttled for the full SLA window) but still use the default short dedup window (`RSS_FEEDS_DEFAULTS.deduplicationTtlMs`, 60s) via `enqueueBulkFetchRssFeeds`. Forced/manual refreshes set `skipDeduplication` so an explicit refresh is not dropped behind a recently queued normal fetch.

## DynamicConfig Key

Key: `rss-feed-crawl-config`, editable through `/admin/dynamic-config`. Score weights and
percentile thresholds are **not** configured here — they are baked into the materialized-view SQL.
Only the dispatch knobs are tunable at runtime:

| Field             | Type    | Default    | Constraints       | Description                                          |
| ----------------- | ------- | ---------- | ----------------- | ---------------------------------------------------- |
| `enabled`         | boolean | `true`     | -                 | Toggle tiered crawl mode. False = flat TTL fallback. |
| `tier1_sla_ms`    | number  | `300000`   | 1 ms to 7 days    | Tier 1 fetch SLA in milliseconds (5 min).            |
| `tier2_sla_ms`    | number  | `900000`   | 1 ms to 7 days    | Tier 2 fetch SLA in milliseconds (15 min).           |
| `tier3_sla_ms`    | number  | `3600000`  | 1 ms to 7 days    | Tier 3 fetch SLA in milliseconds (1 hour).           |
| `tier4_sla_ms`    | number  | `7200000`  | 1 ms to 7 days    | Tier 4 fetch SLA in milliseconds (2 hours).          |
| `tier5_sla_ms`    | number  | `86400000` | 1 ms to 7 days    | Tier 5 fetch SLA in milliseconds (24 hours).         |
| `capacity_budget` | number  | `100`      | 1 to 10,000 feeds | Max feeds dispatched per dispatcher run.             |

## Crawl history retention

`rss_feed_crawls` retains 30 days of crawl history. Expired months are dropped by
`cleanupPartitions` rather than row-deleted. Conditional GET metadata stays on `rss_feeds`.
Fetch withholds `If-None-Match`/`If-Modified-Since` when no replayable crawl body remains, so a
304 cannot starve item updates after partition drop. Reconstructing a 304 body still needs a
crawl row inside the retention window.

## Related

- Queue configuration: [../../backend/queues/rss-feeds/README.md](../../../backend/queues/rss-feeds/README.md)
- psql maintenance queue: [../../backend/queues/psql/README.md](../../../backend/queues/psql/README.md)
- Partition drop retention: [../../overview/architecture/partitioning-strategy.md](../../overview/architecture/partitioning-strategy.md)
- Service: [../../backend/services/rss-feeds/README.md](../../../backend/services/rss-feeds/README.md)
- Implementation: `backend/services/rss-feeds/crawl-config.mts`, `backend/services/rss-feeds/get-to-fetch.mts`
