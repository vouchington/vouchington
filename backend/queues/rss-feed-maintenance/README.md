# @queues/rss-feed-maintenance

The ranked `rss-feed-maintenance` queue carries RSS item category snapshots and backfills, feed discoverability evaluations, and topic alias changes. Its scheduler manifest retains the snapshot and alias reconciliation IDs and five-minute cadence. The snapshot, category-mapping, and post-invalidation ordering lanes each retain concurrency 1.

See the [queue architecture](../../../docs/overview/architecture/queues/README.md).
