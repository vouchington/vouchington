import { pagedDispatchJobOptions } from '@data-stores/valkey-glide-mq/paged-dispatcher'
import { PRIORITY_DISPATCH, PRIORITY_TASK } from '../config.mts'
import { defineBackgroundDomain, defineBackgroundJob } from './define-job.mts'

// The old queue's cap was its worker concurrency of 5. Feed imports share one domain-wide group of
// 5; the sync keeps its own singleton lane (outside the group) so pages never overlap. Imports reach
// independent feed hosts, so a rate-limit signal delays only its own job.
export const KAGI_SMALLWEB_DOMAIN = defineBackgroundDomain({
  domain: 'kagi-smallweb',
  group: { kind: 'domain', concurrency: 5, deferral: 'job' },
  workerConcurrency: 5,
})

const DEFAULTS = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 30_000, jitter: 0.5 },
  removeOnComplete: 100,
  removeOnFail: 100,
} as const

/** One page of the Small Web lists; `cursor` is the last feed URL of the page before it. */
export type KagiSyncData = { cursor?: string }

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
