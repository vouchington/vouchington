import { pagedDispatchJobOptions } from '@data-stores/valkey-glide-mq/paged-dispatcher'
import { PRIORITY_DISPATCH, PRIORITY_TASK } from '../config.mts'
import { defineBackgroundDomain, defineBackgroundJob } from './define-job.mts'

// Feed imports share a domain lane; sync pages use a separate singleton lane.
export const KAGI_SMALLWEB_DOMAIN = defineBackgroundDomain({
  domain: 'kagi-smallweb',
  deferral: 'job',
  workerConcurrency: 5,
})

const DEFAULTS = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 30_000, jitter: 0.5 },
  removeOnComplete: 100,
  removeOnFail: 100,
} as const

/**
 * One page of the Small Web lists. `cursor` is the last feed URL of the page before it.
 * `feedListDir` is that run's on-disk diff, so a continuation does not download the lists again.
 */
export type KagiSyncData = { cursor?: string; feedListDir?: string }

export type KagiFeedJobData = {
  feedUrl: string
  name: string
  slug: string
  sourceType: 'web' | 'comic' | 'youtube'
}

export const KAGI_SMALLWEB_SYNC_JOB = defineBackgroundJob<KagiSyncData>(KAGI_SMALLWEB_DOMAIN, {
  name: 'sync',
  priority: PRIORITY_DISPATCH,
  ...DEFAULTS,
  ...pagedDispatchJobOptions('kagi'),
})
export const KAGI_SMALLWEB_PROCESS_FEED_JOB = defineBackgroundJob<KagiFeedJobData>(
  KAGI_SMALLWEB_DOMAIN,
  { name: 'processFeed', priority: PRIORITY_TASK, ...DEFAULTS },
)

export const KAGI_SMALLWEB_JOBS = [KAGI_SMALLWEB_SYNC_JOB, KAGI_SMALLWEB_PROCESS_FEED_JOB] as const
