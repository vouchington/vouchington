# RSS Feed Maintenance Worker

Source entrypoint: [backend/workers/rss-feed-maintenance/README.md](../../../../../../backend/workers/rss-feed-maintenance/README.md)

`rssFeedMaintenance` dispatches seven job names from the [shared RSS feed maintenance queue](../../rss-feed-maintenance/README.md). It is an IO worker with a dedicated command client and baseline concurrency 10. The snapshot and alias reconciliation processors drain bounded durable PostgreSQL rows and chain serialized continuations after a full page. Feed discoverability and topic alias handlers preserve their existing service behavior.

The domain pages retain the [item-category](../rss-feed-item-categories/README.md), [discoverability](../rss-feed-discoverability/README.md), and [topic-alias](../topic-aliases/README.md) recovery details.
