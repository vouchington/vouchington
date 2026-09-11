const DEFAULT_VALKEY_URL =
  process.env.VALKEY_URL || `redis://${process.env.DOCKER_HOST_IP || 'localhost'}:6379`

export const config = {
  // used for sessions; always primary (no replica reads — token lookups must be consistent)
  session_url: process.env.VALKEY_SESSION_URL || DEFAULT_VALKEY_URL,

  // used for caching; preferReplica routes writes to primary automatically
  cache_url: process.env.VALKEY_CACHE_URL || DEFAULT_VALKEY_URL,

  // used for rate limiting; must always read from primary to avoid replica lag
  rate_limiter_url:
    process.env.VALKEY_RATE_LIMITER_URL || process.env.VALKEY_CACHE_URL || DEFAULT_VALKEY_URL,

  // used for distributed configuration
  dynamic_config_url: process.env.VALKEY_DYNAMIC_CONFIG_URL || DEFAULT_VALKEY_URL,

  // used for worker queues
  worker_queue_url: process.env.VALKEY_WORKER_QUEUE_URL || DEFAULT_VALKEY_URL,

  // used for bloom filter operations; defaults to cache URL so no extra connection
  // is required in environments that run on a single Valkey instance
  bloom_url: process.env.VALKEY_BLOOM_URL || process.env.VALKEY_CACHE_URL || DEFAULT_VALKEY_URL,

  inflight_retry_attempts: (() => {
    const value = Number(process.env.VALKEY_INFLIGHT_RETRY_ATTEMPTS)
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : 3
  })(),

  inflight_retry_delay_ms: (() => {
    const value = Number(process.env.VALKEY_INFLIGHT_RETRY_DELAY_MS)
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : 1_000
  })(),
}
