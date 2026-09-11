# Cache Purge Worker

Worker package that POSTs batches of Cache-Tags (up to `MAX_TAGS_PER_REQUEST`, 30 tags/job) to the
Cloudflare Worker's `/infra/cache-purge` route, evicting matching entries from Workers Cache (GA).

## Exports

- `cachePurge` - worker instance for the `cache-purge` queue. Concurrency baseline 5, plus a
  Valkey-backed `CACHE_PURGE_LIMITER` (`{ max: 4, duration: 60_000 }`, 4 req/min) because
  Workers Cache purge always uses Free-tier 5 req/min regardless of zone plan — the limiter
  throttles the aggregate rate across every worker replica, not per-instance, so concurrency is
  left unchanged. See
  [queue README](../../queues/cache-purge/README.md#queue-configuration) for the full rationale.

## Related

- Queue surface: [../../queues/cache-purge/README.md](../../queues/cache-purge/README.md)
- Purge caller: [../../services/entity-cache/purge.mts](../../services/entity-cache/purge.mts)
- Worker entrypoint: [../../entrypoints/worker-io/README.md](../../entrypoints/worker-io/README.md)
