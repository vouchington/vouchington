# RSS Feeds Worker

Worker package for RSS feed dispatch and fetch jobs.

The dispatcher consumes the nightly materialized crawl tiers supplied by the RSS service and queue.
It preserves the existing capacity budget and queue priorities; membership changes do not trigger a
worker-side re-tier or manual refresh.

## Exports

- `rss_feeds` - worker instance for the `rss-feeds` queue.

## Related

- Queue surface: [../../queues/rss-feeds/README.md](../../queues/rss-feeds/README.md)
- Worker entrypoint: [../../entrypoints/worker-io/README.md](../../entrypoints/worker-io/README.md)
