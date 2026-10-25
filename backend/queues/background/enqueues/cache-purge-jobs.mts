import { PRIORITY_TASK } from '../config.mts'
import { defineBackgroundDomain, defineBackgroundJob } from './define-job.mts'

// Workers Cache `ctx.cache.purge()` always uses Free-tier limits (5 req/min, burst 25) regardless
// of zone plan. GlideMQ's rate limit is a window, not a token bucket, so 4/min keeps headroom
// under that cap. The domain ordering key carries the rate window across every worker.
export const CACHE_PURGE_RATE_LIMIT = { max: 4, duration: 60_000 } as const

export const CACHE_PURGE_DOMAIN = defineBackgroundDomain({
  domain: 'cache-purge',
  rateLimit: CACHE_PURGE_RATE_LIMIT,
  workerConcurrency: 5,
})

export const CACHE_PURGE_TAGS_JOB = defineBackgroundJob<{ tags: string[] }>(CACHE_PURGE_DOMAIN, {
  name: 'processPurgeCacheTag',
  priority: PRIORITY_TASK,
  attempts: 3,
  backoff: { type: 'exponential', delay: 1000, jitter: 0.5 },
  removeOnComplete: 100,
  removeOnFail: 100,
})

export const CACHE_PURGE_JOBS = [CACHE_PURGE_TAGS_JOB] as const
