# @queues/crawl-dispatch

The ranked `crawl-dispatch` queue carries hostname crawl dispatch and HTML boilerplate-removal work. Hostname, tier, refresh, cleanup, and boilerplate job names, payloads, deduplication, and schedule IDs remain distinct. The separate ranked `crawl_urls` queue retains its per-host ordering lane and distinct lock policy.

See the [queue architecture](../../../docs/overview/architecture/queues/crawl-dispatch/README.md).
