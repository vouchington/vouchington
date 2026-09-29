# RSS Feed Item Categories Worker

Source entrypoint: [backend/workers/rss-feed-item-categories/README.md](../../../../../../backend/workers/rss-feed-item-categories/README.md)

Worker package for RSS feed item category upserts, topic-alias backfills, and serialized durable category-snapshot reconciliation. A full bounded snapshot page schedules one immediate continuation; the PostgreSQL-backed schedule remains the lost-dispatch fallback.

## Exports

- `rssFeedItemCategories` - worker instance for the `rss-feed-item-categories` queue.

## Related

- Queue surface: [../../queues/rss-feed-item-categories/README.md](../../rss-feed-item-categories/README.md)
- Worker entrypoint: [../../entrypoints/worker-io/README.md](../../../backend/entrypoints/worker-io/README.md)
