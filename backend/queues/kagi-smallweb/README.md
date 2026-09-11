# Kagi Small Web System

Triggers periodic synchronization of RSS feeds from Kagi Small Web feed lists.

## Queue Configuration

### `kagi-smallweb` (concurrency: 1)

- `sync` — calls `syncKagiSmallWeb()` to fetch the latest Kagi Small Web feed lists and add any new RSS feeds to the platform

## Related

- Parent: [../CLAUDE.md](../CLAUDE.md)
- Kagi Small Web service: [../../services/kagi-smallweb/README.md](../../services/kagi-smallweb/README.md)
- RSS feeds system: [../rss-feeds/README.md](../rss-feeds/README.md)
