# @queues/crawl-dispatch

The ranked `crawl-dispatch` queue carries hostname crawl dispatch and HTML boilerplate-removal work. Hostname, tier, refresh, cleanup, and boilerplate job names, payloads, deduplication, and schedule IDs remain distinct. This queue does not carry the priority-zero `crawl_urls` jobs or their per-host ordering lane.

See the [queue architecture](../../../docs/overview/architecture/queues/crawl-dispatch/README.md).
