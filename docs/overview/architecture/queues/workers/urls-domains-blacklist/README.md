# URLs Domains Blacklist Worker

Source entrypoint: [backend/workers/urls-domains-blacklist/README.md](../../../../../../backend/workers/urls-domains-blacklist/README.md)

Worker package for URL domain blacklist dispatcher, source sync, and the five-minute
bounded hostname-policy cache invalidation sweep. The sweep recovers committed work
whose inline eviction failed or whose lease expired.

## Exports

- `urlsDomainsBlacklistHandlers` - the domain's handlers for the shared
  [background worker](../background/README.md); there is no per-queue `Worker`.

## Related

- Queue surface: [../../queues/urls-domains-blacklist/README.md](../../urls-domains-blacklist/README.md)
- Worker entrypoint: [../../entrypoints/worker-io/README.md](../../../backend/entrypoints/worker-io/README.md)
