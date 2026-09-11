export const QUEUE_NAME = 'cache-purge'
export const PRIORITY_DEFAULT = 10
// Workers Cache `ctx.cache.purge()` always uses Free-tier limits (5 req/min, burst 25)
// regardless of zone plan. GlideMQ's limiter is a window, not a token bucket, so 4/min
// keeps headroom under that cap. See https://developers.cloudflare.com/workers/cache/purge/
export const CACHE_PURGE_LIMITER = { max: 4, duration: 60_000 } as const
// Debounces rapid repeat purges of the exact same tag chunk (e.g. a burst of edits producing the
// same set of Cache-Tags) into a single outbound purge call, mirroring entity-metrics-cache-refresh's
// debounce window. See enqueues.mts for the <=30-tag chunking that happens before this dedup key
// is derived.
export const DEDUPLICATION_TTL_MS = 5_000
