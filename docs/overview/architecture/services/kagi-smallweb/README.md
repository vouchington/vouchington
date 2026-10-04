# @services/kagi-smallweb

Source entrypoint: [backend/services/kagi-smallweb/README.md](../../../../../backend/services/kagi-smallweb/README.md)

Syncs RSS feeds from Kagi Small Web feed lists — fetches multiple sources in parallel, deduplicates against existing feeds, and processes new entries.

## Key exports

- `syncKagiSmallWeb(): Promise<SyncResult>` — fetches Kagi Small Web feed lists, identifies new RSS feeds not yet in the database, and enqueues them for crawling
- `SyncResult` — `{ total, added, skipped }`

## Related

- Parent: [../AGENTS.md](../../../../../backend/services/AGENTS.md)
- Kagi Small Web system: [../../queues/kagi-smallweb/README.md](../../queues/kagi-smallweb/README.md)
- RSS feeds service: [../rss-feeds/README.md](../rss-feeds/README.md)

Feed deduplication probes only fetched candidate URLs in bounded indexed `ANY` chunks, using `candidate_batch_size` from the registered import configuration. The fetched external lists remain the import input; this change does not redesign the source-list sweep.
