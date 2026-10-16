import { PRIORITY_DISPATCH, PRIORITY_TASK } from '../config.mts'
import { defineBackgroundDomain, defineBackgroundJob } from './define-job.mts'

// The old queue had no ordering keys; its cap was the worker concurrency of 5. One domain-wide group
// of 5 keeps that cap on the shared worker.
export const FOLLOWER_DISTRIBUTIONS_DOMAIN = defineBackgroundDomain({
  domain: 'follower-distributions',
  group: { kind: 'domain', concurrency: 5 },
  workerConcurrency: 5,
})

export type ProcessFollowerDistributionData = { distributionId: string }
/** One page of incomplete distribution ids after `afterId`; the first page has no cursor. */
export type BackfillFollowerDistributionsData = { afterId?: string }

export const FOLLOWER_DISTRIBUTIONS_PROCESS_JOB =
  defineBackgroundJob<ProcessFollowerDistributionData>(FOLLOWER_DISTRIBUTIONS_DOMAIN, {
    name: 'processFollowerDistribution',
    priority: PRIORITY_TASK,
    attempts: 3,
    backoff: { type: 'exponential', delay: 1000, jitter: 0.5 },
    removeOnComplete: 100,
    removeOnFail: 100,
  })
export const FOLLOWER_DISTRIBUTIONS_BACKFILL_JOB =
  defineBackgroundJob<BackfillFollowerDistributionsData>(FOLLOWER_DISTRIBUTIONS_DOMAIN, {
    name: 'backfillFollowerDistributions',
    priority: PRIORITY_DISPATCH,
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000, jitter: 0.5 },
    removeOnComplete: 100,
    removeOnFail: 100,
  })

export const FOLLOWER_DISTRIBUTIONS_JOBS = [
  FOLLOWER_DISTRIBUTIONS_PROCESS_JOB,
  FOLLOWER_DISTRIBUTIONS_BACKFILL_JOB,
] as const
