# Crawler Worker

Source entrypoint: [backend/workers/crawler/README.md](../../../../../../backend/workers/crawler/README.md)

Worker package for URL crawl jobs.

URL result shaping and retry/error handling live in
[processor outcomes](../../../../../../backend/workers/crawler/processors/outcomes.mts),
which the job dispatcher imports directly. The outcome tests keep real URL, rate-limit and queue
ownership while exercising the same handlers used by the worker.

## Exports

- `crawlUrls` - worker instance for the `crawl_urls` queue.

## Related

- Queue surface: [../../queues/crawler/README.md](../../crawler/README.md)
- Worker entrypoint: [../../entrypoints/worker-cpu/README.md](../../../backend/entrypoints/worker-cpu/README.md)
