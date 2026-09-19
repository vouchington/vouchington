# Crawl embeds service

Owns Vouchington policy for crawl-scoped embed metadata. HTML planning delegates to the generic
`@vouchington/embeds` package and performs no remote request. Remote oEmbed enrichment is invoked by
the `crawl-embeds` I/O worker and updates only the crawl ID carried by that job.

Provider selection, endpoint/player allowlists, SSRF validation, and pinned dispatchers are
Vouchington policy. Queueing, retries, rate limits, and persistence do not live in the platform
package.

`backfillPendingCrawlEmbeds()` is the recovery path. It cursor-streams only crawls with a saved
base embed result and unresolved endpoint, then awaits bounded bulk enqueue batches.
