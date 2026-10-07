# Sitemaps Worker

Source entrypoint: [backend/workers/sitemaps/README.md](../../../../../../backend/workers/sitemaps/README.md)

Worker package for sitemap index, post-day sitemap, and historical backfill jobs.

## Exports

- `sitemaps` - worker instance for the `sitemaps` queue.

## Related

- Queue surface: [../../queues/sitemaps/README.md](../../sitemaps/README.md)
- Worker entrypoint: [../../entrypoints/worker-io/README.md](../../../backend/entrypoints/worker-io/README.md)

## Provisional export status (#1360)

These package exports are retained pending intended-use review. External production use is
unconfirmed; the exports may be made private or removed after review. Their implementations and
current owner behavior remain unchanged.

The exported name is retained only as an external surface: its same-file production implementation and
current default callers remain required.

- `backfillDispatcherDependencies`
- `updatePostDaySitemapDependencies`
- `updateSitemapIndexDependencies`
