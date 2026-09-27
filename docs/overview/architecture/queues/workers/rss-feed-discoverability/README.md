# RSS Feed Discoverability Worker

Source entrypoint: [backend/workers/rss-feed-discoverability/README.md](../../../../../../backend/workers/rss-feed-discoverability/README.md)

Worker package for evaluating RSS feed discoverability.

## Exports

- `rssFeedDiscoverability` - worker instance for the `rss-feed-discoverability` queue.

Malformed `processEvaluateRssFeedDiscoverability` jobs fail with `RSS feed discoverability job .rssFeedId is required` before processing.

## Related

- Queue surface: [../../queues/rss-feed-discoverability/README.md](../../rss-feed-discoverability/README.md)
- Worker entrypoint: [../../entrypoints/worker-io/README.md](../../../backend/entrypoints/worker-io/README.md)
