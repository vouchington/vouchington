import { DynamicConfig } from '@data-stores/valkey'
import { getBoundedPositiveIntegerField } from 'valkyries/dynamic-config'

export const BACKGROUND_CPU_QUEUE_NAME = 'background-cpu'

/** Lower numbers win: tasks run ahead of further dispatcher fan-out. */
export const PRIORITY_TASK = 10
/** Dispatchers, backfills, and recovery run behind the tasks they create. */
export const PRIORITY_DISPATCH = 100

/**
 * Every domain that runs in the shared `background-cpu` queue. A domain is the unit operators pause,
 * retry, and read stats for, and it namespaces its job names, ordering keys, deduplication ids,
 * job ids, and scheduler ids. Add a domain here and register it in `enqueues/registry.mts`.
 */
export const BACKGROUND_CPU_DOMAINS = [
  'crawl',
  'bedrock-embeddings',
  'ai-spend-cap',
  'content-analysis',
] as const

export type BackgroundCpuDomain = (typeof BACKGROUND_CPU_DOMAINS)[number]

export function isBackgroundCpuDomain(value: string): value is BackgroundCpuDomain {
  return (BACKGROUND_CPU_DOMAINS as readonly string[]).includes(value)
}

export const backgroundCpuQueueConfig = new DynamicConfig({
  key: 'background-cpu-queue-config',
  fieldTypes: {
    pause_recheck_ms: 'number',
    pause_cache_ms: 'number',
    domain_stats_scan_cap: 'number',
    single_backlog_scan_cap: 'number',
  },
  defaultFields: {
    pause_recheck_ms: 5_000,
    pause_cache_ms: 2_000,
    domain_stats_scan_cap: 1_000,
    single_backlog_scan_cap: 1_000,
  },
})

export const backgroundCpuQueueMaxValues = {
  pause_recheck_ms: 600_000,
  pause_cache_ms: 60_000,
  domain_stats_scan_cap: 10_000,
  single_backlog_scan_cap: 10_000,
}

/** How long a paused domain's job waits before it re-reads its pause state. */
export function getPauseRecheckMs(): number {
  return getBoundedPositiveIntegerField(backgroundCpuQueueConfig, 'pause_recheck_ms', {
    defaultValue: 5_000,
    maxValue: backgroundCpuQueueMaxValues.pause_recheck_ms,
  })
}

/** How long a worker trusts a domain's pause state before it reads PostgreSQL again. */
export function getPauseCacheMs(): number {
  return getBoundedPositiveIntegerField(backgroundCpuQueueConfig, 'pause_cache_ms', {
    defaultValue: 2_000,
    maxValue: backgroundCpuQueueMaxValues.pause_cache_ms,
  })
}

/** Jobs scanned per domain and state for one operator stats request. */
export function getDomainStatsScanCap(): number {
  return getBoundedPositiveIntegerField(backgroundCpuQueueConfig, 'domain_stats_scan_cap', {
    defaultValue: 1_000,
    maxValue: backgroundCpuQueueMaxValues.domain_stats_scan_cap,
  })
}

/** Maximum shared-queue jobs inspected per state for a Bedrock single admission decision. */
export function getSingleBacklogScanCap(): number {
  return getBoundedPositiveIntegerField(backgroundCpuQueueConfig, 'single_backlog_scan_cap', {
    defaultValue: 1_000,
    maxValue: backgroundCpuQueueMaxValues.single_backlog_scan_cap,
  })
}
