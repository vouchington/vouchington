import { PRIORITY_TASK } from '../config.mts'
import { defineBackgroundDomain, defineBackgroundJob } from './define-job.mts'

// Workers Cache `ctx.cache.purge()` always uses Free-tier limits (5 req/min, burst 25) regardless
// of zone plan. GlideMQ's rate limit is a window, not a token bucket, so 4/min keeps headroom
// under that cap. The domain ordering key carries the rate window across every worker.
const CACHE_PURGE_DOMAIN_NAME = 'cache-purge' as const
const CACHE_PURGE_TAGS_JOB_LOCAL_NAME = 'processPurgeCacheTag' as const
const CACHE_PURGE_RATE_LIMIT = { max: 4, duration: 60_000 } as const

export const CACHE_PURGE_DOMAIN = defineBackgroundDomain({
  domain: CACHE_PURGE_DOMAIN_NAME,
  rateLimit: CACHE_PURGE_RATE_LIMIT,
  workerConcurrency: 5,
})

export const CACHE_PURGE_TAGS_JOB_NAME =
  `${CACHE_PURGE_DOMAIN_NAME}.${CACHE_PURGE_TAGS_JOB_LOCAL_NAME}` as const

export type CachePurgeTagsData = { tags: string[] }

export type CachePurgeJobPayloads = {
  [CACHE_PURGE_TAGS_JOB_NAME]: CachePurgeTagsData
}

export const CACHE_PURGE_TAGS_JOB = defineBackgroundJob<
  CachePurgeJobPayloads[typeof CACHE_PURGE_TAGS_JOB_NAME]
>(CACHE_PURGE_DOMAIN, {
  name: CACHE_PURGE_TAGS_JOB_LOCAL_NAME,
  priority: PRIORITY_TASK,
  attempts: 3,
  backoff: { type: 'exponential', delay: 1000, jitter: 0.5 },
  removeOnComplete: 100,
  removeOnFail: 100,
})

export const CACHE_PURGE_JOBS = [CACHE_PURGE_TAGS_JOB] as const
