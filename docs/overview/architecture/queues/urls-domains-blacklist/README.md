# URL Domains Blacklist System

Source entrypoint: [backend/queues/urls-domains-blacklist/README.md](../../../../../backend/queues/urls-domains-blacklist/README.md)

This system manages domain blacklists for URLs and email addresses using a two-level dispatcher pattern.
It also runs a bounded, scheduled drain of durable hostname-policy cache invalidations. Feed sync,
manual block, and manual unblock enqueue hostname IDs with their database changes; each successful
eviction clears only the claimed generation. The sweep retries work left by cache failures.

## Architecture

### Domain

Domain `urls-domains-blacklist` of the shared [`background` queue](../background/README.md); job
names are `urls-domains-blacklist.<name>`. The source syncs share the domain-wide group of 5
(priority 10), the old worker concurrency. The dispatcher runs in the namespaced lane
`urls-domains-blacklist:dispatcher` (concurrency 1, priority 100) and the hostname cache-invalidation
sweep (`urls-domains-blacklist.drainHostnameCacheInvalidationWork`, every five minutes, priority 100)
drains in `urls-domains-blacklist:cache-invalidation` (concurrency 1), both outside the group, so the
domain runs at most seven jobs. It adds a worker baseline of
five. `WORKER_CONCURRENCY_URLS_DOMAINS_BLACKLIST` and the old queue no longer exist.

### Dispatcher Pattern

1. **Level 1: Blacklist Dispatcher** (`urls-domains-blacklist.processBlacklistDispatcher`)
   - Runs weekly (every Sunday at 2 AM)
   - Fetches the blacklist sources from the database; they are the fixed, code-defined set seeded from `BLACKLISTS`, so one run is bounded by the code and needs no continuation
   - Enqueues a sync job for each source with 1-hour delays between them

2. **Level 2: Source Sync** (`urls-domains-blacklist.processBlacklistSourceSync`)
   - Downloads the blacklist file with conditional HTTP requests (etag/last-modified)
   - Skips processing if the file hasn't changed (304)
   - Writes new domains to a local sorted CSV file
   - Exports current domains from database to a local sorted CSV file
   - Performs streaming diff comparison between the two CSV files
   - Applies insertions and deletions in batches (10,000 domains per batch)
   - Avoids database IOPS and writes to the writer endpoint during diff operation

## Configuration

Blacklist sources are configured in the database (`domain_blocklist_sources` table) and seeded via `scripts/seed/index.mts`.

## Usage

The system runs automatically on a weekly schedule. To manually trigger:

```typescript
import { enqueueBlacklistDispatcher } from '@queues/urls-domains-blacklist/enqueues'

await enqueueBlacklistDispatcher()
```

## Related

- [URL Domains Blacklist Service](../../services/urls-domains-blacklist/README.md)
- [Domain Blacklist Check Service](../../services/domain-blacklist-check/README.md)
