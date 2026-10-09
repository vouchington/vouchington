import { createBulkEnqueueFunction, createEnqueueFunction } from '@data-stores/valkey-glide-mq'
import type { EnqueueReturnType } from '@voucha/types'
import type { JobOptions } from 'glide-mq'
import {
  FOLLOWER_DISTRIBUTIONS_BACKFILL_DEFAULTS,
  FOLLOWER_DISTRIBUTIONS_DEFAULTS,
  FOLLOWER_DISTRIBUTION_BACKFILL_DEDUPLICATION_TTL_MS,
  PRIORITY_BACKFILL,
  PRIORITY_DEFAULT,
  QUEUE_NAME,
} from './config.mts'
import { followerDistributions } from './queues.mts'

type ProcessFollowerDistributionData = { distributionId: string }

const enqueueProcessFollowerDistributionJob = createEnqueueFunction<
  ProcessFollowerDistributionData,
  'processFollowerDistribution'
>({
  defaults: FOLLOWER_DISTRIBUTIONS_DEFAULTS,
  queue: followerDistributions,
  queueName: QUEUE_NAME,
  jobName: 'processFollowerDistribution',
})

const enqueueBulkProcessFollowerDistributionJobs = createBulkEnqueueFunction<
  string,
  ProcessFollowerDistributionData,
  'processFollowerDistribution'
>({
  defaults: FOLLOWER_DISTRIBUTIONS_DEFAULTS,
  queue: followerDistributions,
  queueName: QUEUE_NAME,
  jobName: 'processFollowerDistribution',
  buildJob: distributionId => ({
    data: { distributionId },
    opts: processFollowerDistributionJobOptions(distributionId),
  }),
})

const enqueueBackfillFollowerDistributionsJob = createEnqueueFunction<
  Record<string, never>,
  'backfillFollowerDistributions'
>({
  defaults: FOLLOWER_DISTRIBUTIONS_BACKFILL_DEFAULTS,
  queue: followerDistributions,
  queueName: QUEUE_NAME,
  jobName: 'backfillFollowerDistributions',
})

export function enqueueProcessFollowerDistribution(distributionId: string): EnqueueReturnType {
  return enqueueProcessFollowerDistributionJob(
    { distributionId },
    processFollowerDistributionJobOptions(distributionId),
  )
}

export function enqueueBulkProcessFollowerDistributions(
  distributionIds: string[],
): EnqueueReturnType {
  return enqueueBulkProcessFollowerDistributionJobs([...new Set(distributionIds)], {
    priority: PRIORITY_DEFAULT,
  })
}

export function enqueueBackfillFollowerDistributions(): EnqueueReturnType {
  return enqueueBackfillFollowerDistributionsJob({}, {
    priority: PRIORITY_BACKFILL,
    deduplication: {
      id: 'backfill_follower_distributions',
      mode: 'throttle',
      ttl: FOLLOWER_DISTRIBUTION_BACKFILL_DEDUPLICATION_TTL_MS,
    },
  } satisfies Partial<JobOptions>)
}

function processFollowerDistributionJobOptions(distributionId: string): Partial<JobOptions> {
  return {
    priority: PRIORITY_DEFAULT,
    deduplication: {
      id: `process_follower_distribution__${distributionId}`,
      mode: 'debounce',
    },
  }
}
