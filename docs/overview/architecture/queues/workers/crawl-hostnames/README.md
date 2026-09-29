# Crawl Hostnames Worker

Source entrypoint: [backend/workers/crawl-hostnames/README.md](../../../../../../backend/workers/crawl-hostnames/README.md)

Worker package for hostname crawl dispatch, per-hostname URL dispatch, tiered crawl dispatch, and crawl cleanup jobs.

## Exports

- `crawlHostnames` - worker instance for the `crawl_hostnames` queue.

## Related

- Queue surface: [../../queues/crawl-hostnames/README.md](../../crawl-hostnames/README.md)
- Worker entrypoint: [../../entrypoints/worker-cpu/README.md](../../../backend/entrypoints/worker-cpu/README.md)
