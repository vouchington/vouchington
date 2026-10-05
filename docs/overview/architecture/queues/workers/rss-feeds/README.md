# RSS Feeds Worker

Source entrypoint: [backend/workers/rss-feeds/README.md](../../../../../../backend/workers/rss-feeds/README.md)

Worker package for RSS feed dispatch and fetch jobs.

The dispatcher consumes the nightly materialized crawl tiers supplied by the RSS service and queue.
It preserves the existing capacity budget and queue priorities; membership changes do not trigger a
worker-side re-tier or manual refresh.

## Exports

- `rss_feeds` - worker instance for the `rss-feeds` queue.

## Related

- Queue surface: [../../queues/rss-feeds/README.md](../../rss-feeds/README.md)
- Worker entrypoint: [../../entrypoints/worker-io/README.md](../../../backend/entrypoints/worker-io/README.md)

## Provisional export status (#1360)

These package exports are retained pending intended-use review. External production use is
unconfirmed; the exports may be made private or removed after review. Their implementations and
current owner behavior remain unchanged.

The exported name is retained only as an external surface: its same-file production implementation and
current default callers remain required.

- `processFetchRssFeed`
- `processRssFeedsDispatcher`
