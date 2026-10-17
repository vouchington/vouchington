# Sitemaps System

Source entrypoint: [backend/queues/sitemaps/README.md](../../../../../backend/queues/sitemaps/README.md)

Generates and updates XML sitemaps — per-day post sitemaps, type indexes, dynamic family indexes, root index, and scheduled backfill dispatchers.

## Queue Configuration

### Domain: `sitemaps`

Domain `sitemaps` of the shared [`background` queue](../background/README.md); job names are
`sitemaps.<name>`. The domain has no domain-wide group: every job runs in one of four namespaced singleton lanes, each
one job at a time, so at most four run at once (`sitemaps:post_day_today`, `sitemaps:post_day_past`, `sitemaps:indexes`,
`sitemaps:dispatcher`). It adds a worker baseline of five. `WORKER_CONCURRENCY_SITEMAPS` and the old
queue no longer exist.

- `sitemaps.processUpdatePostDaySitemap` — generates or refreshes the XML sitemap for posts on a specific UTC day and post type
- `sitemaps.processUpdatePostTypeIndex` — regenerates the sitemap index for a post type (groups daily sitemaps)
- `sitemaps.processUpdatePostsIndex` — regenerates the root posts sitemap index
- `sitemaps.processUpdateFamilySitemap` — regenerates one dynamic sitemap family (`users`, `topics`, `communities`, `domains`, or `landing-pages`) and then enqueues the root index
- `sitemaps.processUpdateRootIndex` — regenerates the top-level sitemap index linking all sub-indexes
- `sitemaps.processNightlyBackfillWeekDispatcher` — nightly: enqueues sitemap updates for the past 7 days and all dynamic sitemap families
- `sitemaps.processWeeklyBackfillMonthDispatcher` — weekly: enqueues sitemap updates for the past 30 days
- `sitemaps.processMonthlyBackfillArchiveDispatcher` — monthly: enqueues one page of sitemap updates for the historical archive, then chains the next page from the last day it covered (job id `sitemaps.processMonthlyBackfillArchiveDispatcher__<afterDay>`). The archive grows by a day every day, so a page is the `sitemaps-work-config` `archive_backfill_day_page_size` days (default 30) for every post type; the nightly and weekly windows are fixed at 7 and 30 days and stay single jobs.

Post-publication reconciliation uses dedicated non-deduplicated enqueue paths for per-day sitemap
updates and the `landing-pages` family when a bounded page includes a review target. The latter
also covers retained targets for deleted reviews and runs once per page, whether the review became
public or ceased to be public. Every acknowledged repair therefore has newly accepted durable
sitemap jobs; the normal ordering keys serialize rebuilds. Other callers retain the 60-second
throttle used to collapse best-effort refresh bursts.

## Related

- Parent: [../AGENTS.md](../../../../../backend/queues/AGENTS.md)
- Sitemaps service: [../../services/sitemaps/README.md](../../services/sitemaps/README.md)
