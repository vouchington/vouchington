# RSS Feed Discoverability Worker

Worker package for evaluating RSS feed discoverability.

## Exports

- `rssFeedDiscoverability` - worker instance for the `rss-feed-discoverability` queue.

Malformed `processEvaluateRssFeedDiscoverability` jobs fail with `RSS feed discoverability job .rssFeedId is required` before processing.

## Related

- Queue surface: [../../queues/rss-feed-discoverability/README.md](../../queues/rss-feed-discoverability/README.md)
- Worker entrypoint: [../../entrypoints/worker-io/README.md](../../entrypoints/worker-io/README.md)
