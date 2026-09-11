# Crawl embeds queue

`crawl_embeds` resolves a persisted oEmbed endpoint after an HTML crawl has completed.

## Job

- `resolve_crawl_oembed` — carries only `crawl_id`; the worker reads that crawl's persisted
  endpoint and local embed metadata, then writes enrichment back to that same crawl.
- `backfill_crawl_embeds` — streams pending crawl IDs from PostgreSQL in bounded batches and
  bulk-enqueues the resolution jobs with destination-host ordering.

Jobs use simple deduplication per crawl. Queue ordering spaces requests by destination hostname
(`oembed:<hostname>`). A provider 429 follows the queue's bounded exponential retry policy; a
replacement job is deliberately not added while the simple-deduplicated job remains active.

The crawl row is the durable source of truth. The recovery/backfill path re-enqueues rows with a
persisted endpoint that have not reached their crawl-local oEmbed completion marker.

## Related

- Worker: [../../workers/crawl-embeds/README.md](../../workers/crawl-embeds/README.md)
- Crawl service: `@services/crawl-embeds`
- [Queue replayability](../../../docs/requirements/platform/JOB-REPLAYABILITY.md)
