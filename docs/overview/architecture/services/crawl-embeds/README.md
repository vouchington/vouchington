# Crawl embeds service

Source entrypoint: [backend/services/crawl-embeds/README.md](../../../../../backend/services/crawl-embeds/README.md)

Owns Vouchington policy for crawl-scoped embed metadata. HTML planning delegates to the generic
`@vouchington/embeds` package and performs no remote request. Remote oEmbed enrichment is invoked by
the `crawl-embeds` I/O worker and updates only the crawl ID carried by that job.

Provider selection, endpoint/player allowlists, SSRF validation, and pinned dispatchers are
Vouchington policy. Queueing, retries, rate limits, and persistence do not live in the platform
package.

`backfillPendingCrawlEmbeds(afterId)` is the recovery path. Each run reads one page of crawls after
`afterId` that have a saved base embed result and an unresolved endpoint (the `backfill_batch_size`
page size), bulk-enqueues them, and chains the next page from the last crawl id it read.
