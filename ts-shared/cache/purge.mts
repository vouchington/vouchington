// Wire-protocol constants for the backend -> worker Cache-Tag purge request
// (POST /infra/cache-purge). Shared so the header name and tag-count cap can't drift between
// the worker's route handler (cloudflare-worker/src/cache-purge-route.mts) and the backend's
// purge caller (@services/entity-cache/purge.mts).

export const CACHE_PURGE_SECRET_HEADER = 'x-voucha-cache-purge-secret'

// Cloudflare's documented per-request tag cap for cache purge APIs is 30 (classic Cache API);
// Workers Cache's GA limit isn't published (see plan.md's Cost/limits section) so this is a
// conservative provisional cap pending staging verification, not a confirmed platform limit.
export const MAX_TAGS_PER_REQUEST = 30
