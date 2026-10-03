# Sitemaps System

Source entrypoint: [backend/queues/sitemaps/README.md](../../../../../backend/queues/sitemaps/README.md)

Generates and updates XML sitemaps — per-day post sitemaps, type indexes, dynamic family indexes, root index, and scheduled backfill dispatchers.

## Queue Configuration

### `sitemaps` (concurrency: 10; effective: 1 per ordering group)

- `processUpdatePostDaySitemap` — generates or refreshes the XML sitemap for posts on a specific UTC day and post type
- `processUpdatePostTypeIndex` — regenerates the sitemap index for a post type (groups daily sitemaps)
- `processUpdatePostsIndex` — regenerates the root posts sitemap index
- `processUpdateFamilySitemap` — regenerates one dynamic sitemap family (`users`, `topics`, `communities`, `domains`, or `landing-pages`) and then enqueues the root index
- `processUpdateRootIndex` — regenerates the top-level sitemap index linking all sub-indexes
- `processNightlyBackfillWeekDispatcher` — nightly: enqueues sitemap updates for the past 7 days and all dynamic sitemap families
- `processWeeklyBackfillMonthDispatcher` — weekly: enqueues sitemap updates for the past 30 days
- `processMonthlyBackfillArchiveDispatcher` — monthly: enqueues sitemap updates for the full historical archive

Post-publication reconciliation uses dedicated non-deduplicated enqueue paths for per-day sitemap
updates and the `landing-pages` family when a bounded page includes a review target. The latter
also covers retained targets for deleted reviews and runs once per page, whether the review became
public or ceased to be public. Every acknowledged repair therefore has newly accepted durable
sitemap jobs; the normal ordering keys serialize rebuilds. Other callers retain the 60-second
throttle used to collapse best-effort refresh bursts.

## Related

- Parent: [../AGENTS.md](../../../../../backend/queues/AGENTS.md)
- Sitemaps service: [../../services/sitemaps/README.md](../../services/sitemaps/README.md)
