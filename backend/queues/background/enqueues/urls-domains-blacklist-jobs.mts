import { PRIORITY_DISPATCH, PRIORITY_TASK } from '../config.mts'
import { defineBackgroundDomain, defineBackgroundJob } from './define-job.mts'

// The old queue's cap was its worker concurrency of 5. Source syncs share one domain-wide group of
// 5; the dispatcher and the cache-invalidation drain keep their own singleton lanes (outside the
// group), so the domain runs at most 7 jobs. Syncs reach independent source hosts, so a rate-limit
// signal delays only its own job. The dispatcher lists the code-defined blocklist sources (a fixed,
// small set), so it stays one job.
export const URLS_DOMAINS_BLACKLIST_DOMAIN = defineBackgroundDomain({
  domain: 'urls-domains-blacklist',
  group: { kind: 'domain', concurrency: 5, deferral: 'job' },
  workerConcurrency: 5,
})

const DEFAULTS = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 5000, jitter: 0.5 },
  removeOnComplete: 100,
  removeOnFail: 100,
} as const

export const URLS_DOMAINS_BLACKLIST_DISPATCHER_JOB = defineBackgroundJob(
  URLS_DOMAINS_BLACKLIST_DOMAIN,
  { name: 'processBlacklistDispatcher', priority: PRIORITY_DISPATCH, ...DEFAULTS },
)
export const URLS_DOMAINS_BLACKLIST_SOURCE_SYNC_JOB = defineBackgroundJob<{
  sourceId: string | number
}>(URLS_DOMAINS_BLACKLIST_DOMAIN, {
  name: 'processBlacklistSourceSync',
  priority: PRIORITY_TASK,
  ...DEFAULTS,
})

// A sweep, so it runs at dispatcher priority, one drain at a time in its own namespaced lane.
export const URLS_DOMAINS_BLACKLIST_CACHE_INVALIDATION_JOB = defineBackgroundJob(
  URLS_DOMAINS_BLACKLIST_DOMAIN,
  {
    name: 'drainHostnameCacheInvalidationWork',
    priority: PRIORITY_DISPATCH,
    ...DEFAULTS,
  },
)

export const URLS_DOMAINS_BLACKLIST_JOBS = [
  URLS_DOMAINS_BLACKLIST_DISPATCHER_JOB,
  URLS_DOMAINS_BLACKLIST_SOURCE_SYNC_JOB,
  URLS_DOMAINS_BLACKLIST_CACHE_INVALIDATION_JOB,
] as const
