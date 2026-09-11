export const QUEUE_NAME = 'entity-metrics-cache-refresh'
export const PRIORITY_DEFAULT = 10
// Short debounce: collapses rapid re-enqueues (e.g. 100 new followers) into one job
// while still ensuring the cache refreshes promptly. A long TTL (e.g. 24h) in debounce
// mode would silently starve the cache whenever an entity is updated continuously.
export const DEDUPLICATION_TTL_MS = 5_000
