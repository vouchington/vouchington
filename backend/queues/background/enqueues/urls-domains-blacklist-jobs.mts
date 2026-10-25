import { PRIORITY_DISPATCH, PRIORITY_TASK } from '../config.mts'
import { defineBackgroundDomain, defineBackgroundJob } from './define-job.mts'

// Source syncs share the domain lane; dispatcher and invalidation each have a singleton lane.
export const URLS_DOMAINS_BLACKLIST_DOMAIN = defineBackgroundDomain({
  domain: 'urls-domains-blacklist',
  deferral: 'job',
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
