import { DynamicConfig, getBoundedPositiveIntegerField } from '@data-stores/valkey'

export const BACKGROUND_QUEUE_NAME = 'background'

/** Task jobs rank below dispatchers so a fan-out never starves the work it already enqueued. */
export const PRIORITY_TASK = 10
/** Dispatchers, backfills, and recovery run behind the tasks they create. */
export const PRIORITY_DISPATCH = 100

/**
 * Every domain that runs in the shared `background` queue. A domain is the unit operators pause,
 * retry, and read stats for, and it namespaces its job names, ordering keys, deduplication ids,
 * job ids, and scheduler ids. Add a domain here and register it in `enqueues/registry.mts`.
 */
export const BACKGROUND_DOMAINS = [
  'ses-inbound',
  'openai-moderation',
  'post-mentions',
  'story-post-related-url-projections',
  'post-publication',
  'vote-aggregation',
  'entity-listeners',
  'account-lifecycle',
  'article-sync',
  'oauth-authorization-exchange',
] as const

export type BackgroundDomain = (typeof BACKGROUND_DOMAINS)[number]

export function isBackgroundDomain(value: string): value is BackgroundDomain {
  return (BACKGROUND_DOMAINS as readonly string[]).includes(value)
}

export const backgroundQueueConfig = new DynamicConfig({
  key: 'background-queue-config',
  fieldTypes: {
    pause_recheck_ms: 'number',
    pause_cache_ms: 'number',
    domain_stats_scan_cap: 'number',
  },
  defaultFields: { pause_recheck_ms: 5_000, pause_cache_ms: 2_000, domain_stats_scan_cap: 1_000 },
})

export const backgroundQueueMaxValues = {
  pause_recheck_ms: 600_000,
  pause_cache_ms: 60_000,
  domain_stats_scan_cap: 10_000,
}

/** How long a paused domain's job waits before it re-reads its pause state. */
export function getPauseRecheckMs(): number {
  return getBoundedPositiveIntegerField(backgroundQueueConfig, 'pause_recheck_ms', {
    defaultValue: 5_000,
    maxValue: backgroundQueueMaxValues.pause_recheck_ms,
  })
}

/** How long a worker trusts a domain's pause state before it reads PostgreSQL again. */
export function getPauseCacheMs(): number {
  return getBoundedPositiveIntegerField(backgroundQueueConfig, 'pause_cache_ms', {
    defaultValue: 2_000,
    maxValue: backgroundQueueMaxValues.pause_cache_ms,
  })
}

/** Jobs scanned per domain and state for one operator stats request. */
export function getDomainStatsScanCap(): number {
  return getBoundedPositiveIntegerField(backgroundQueueConfig, 'domain_stats_scan_cap', {
    defaultValue: 1_000,
    maxValue: backgroundQueueMaxValues.domain_stats_scan_cap,
  })
}
