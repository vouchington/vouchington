# Cache Purge Worker

Source entrypoint: [backend/workers/cache-purge/README.md](../../../../../../backend/workers/cache-purge/README.md)

Worker package that POSTs batches of Cache-Tags (up to `MAX_TAGS_PER_REQUEST`, 30 tags/job) to the
Cloudflare Worker's `/infra/cache-purge` route, evicting matching entries from Workers Cache (GA).
Jobs require the canonical `{ tags: string[] }` payload; the retired single-tag payload fails.

## Exports

- `cachePurgeHandlers` - the domain's handlers for the shared
  [background worker](../background/README.md); there is no per-queue `Worker`. The Workers Cache
  purge rate limit (`CACHE_PURGE_RATE_LIMIT`, 4 req/min) is the domain's group in the registry, not a
  worker option. See [queue README](../../cache-purge/README.md#queue-configuration) for the full
  rationale.

## Related

- Queue surface: [../../queues/cache-purge/README.md](../../cache-purge/README.md)
- Purge caller: [../../services/entity-cache/purge.mts](../../../../../../backend/services/entity-cache/purge.mts)
- Worker entrypoint: [../../entrypoints/worker-io/README.md](../../../backend/entrypoints/worker-io/README.md)
