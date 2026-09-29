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
