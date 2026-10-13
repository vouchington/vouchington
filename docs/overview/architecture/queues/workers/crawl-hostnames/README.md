# Crawl Hostnames Worker

Source entrypoint: [backend/workers/crawl-dispatch/README.md](../../../../../../backend/workers/crawl-dispatch/README.md)

Worker package for hostname crawl dispatch, per-hostname URL dispatch, tiered crawl dispatch, and crawl cleanup jobs.

## Exports

- `crawlDispatch` - shared worker instance for the `crawl-dispatch` queue.

## Related

- Queue surface: [../../queues/crawl-hostnames/README.md](../../crawl-hostnames/README.md)
- Worker entrypoint: [../../entrypoints/worker-cpu/README.md](../../../backend/entrypoints/worker-cpu/README.md)
