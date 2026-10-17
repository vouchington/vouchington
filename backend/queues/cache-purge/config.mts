// Debounces rapid repeat purges of the exact same tag chunk (e.g. a burst of edits producing the
// same set of Cache-Tags) into a single outbound purge call, mirroring entity-metrics-cache-refresh's
// debounce window. See enqueues.mts for the <=30-tag chunking that happens before this dedup key
// is derived. The Workers Cache purge rate limit lives on the domain group
// (`@queues/background/enqueues/cache-purge-jobs`).
export const DEDUPLICATION_TTL_MS = 5_000
