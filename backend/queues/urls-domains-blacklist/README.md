# URL Domains Blacklist System

This system manages domain blacklists for URLs and email addresses using a two-level dispatcher pattern.

## Architecture

### Queues

1. **Dispatcher Queue** (`urls-domains-blacklist-dispatchers`)
   - Global concurrency: 1
   - Handles main weekly dispatcher

2. **Sync Queue** (`urls-domains-blacklist-sync`)
   - Global concurrency: 5
   - Handles per-source sync jobs

### Dispatcher Pattern

1. **Level 1: Blacklist Dispatcher** (`processBlacklistDispatcher`)
   - Runs weekly (every Sunday at 2 AM)
   - Fetches all blacklist sources from the database
   - Enqueues a sync job for each source with 1-hour delays between them

2. **Level 2: Source Sync** (`processBlacklistSourceSync`)
   - Downloads the blacklist file with conditional HTTP requests (etag/last-modified)
   - Skips processing if the file hasn't changed (304)
   - Writes new domains to a local sorted CSV file
   - Exports current domains from database to a local sorted CSV file
   - Performs streaming diff comparison between the two CSV files
   - Applies insertions and deletions in batches (10,000 domains per batch)
   - Avoids database IOPS and writes to the writer endpoint during diff operation

## Configuration

Blacklist sources are configured in the database (`domain_blacklist_sources` table) and seeded via `scripts/seed/index.mts`.

## Usage

The system runs automatically on a weekly schedule. To manually trigger:

```typescript
import { enqueueBlacklistDispatcher } from '@queues/urls-domains-blacklist/enqueues'

await enqueueBlacklistDispatcher()
```

## Related

- [URL Domains Blacklist Service](../../services/urls-domains-blacklist/README.md)
- [Domain Blacklist Check Service](../../services/domain-blacklist-check/README.md)
