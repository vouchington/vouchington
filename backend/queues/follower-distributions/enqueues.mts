import { createBackgroundBulkEnqueue, createBackgroundEnqueue } from '@queues/background/enqueues'
import {
  FOLLOWER_DISTRIBUTIONS_BACKFILL_JOB,
  FOLLOWER_DISTRIBUTIONS_PROCESS_JOB,
} from '@queues/background/enqueues/follower-distributions-jobs'
import type { EnqueueReturnType } from '@voucha/types'
import type { JobOptions } from 'glide-mq'
import { FOLLOWER_DISTRIBUTION_BACKFILL_DEDUPLICATION_TTL_MS } from './config.mts'

const enqueueProcessFollowerDistributionJob = createBackgroundEnqueue(
  FOLLOWER_DISTRIBUTIONS_PROCESS_JOB,
)

const enqueueBulkProcessFollowerDistributionJobs = createBackgroundBulkEnqueue(
  FOLLOWER_DISTRIBUTIONS_PROCESS_JOB,
  (distributionId: string) => ({
    data: { distributionId },
    opts: processFollowerDistributionJobOptions(distributionId),
  }),
)

const enqueueBackfillFollowerDistributionsJob = createBackgroundEnqueue(
  FOLLOWER_DISTRIBUTIONS_BACKFILL_JOB,
)

export function enqueueProcessFollowerDistribution(distributionId: string): EnqueueReturnType {
  return enqueueProcessFollowerDistributionJob(
    { distributionId },
    processFollowerDistributionJobOptions(distributionId),
  )
}

export function enqueueBulkProcessFollowerDistributions(
  distributionIds: string[],
): EnqueueReturnType {
  return enqueueBulkProcessFollowerDistributionJobs([...new Set(distributionIds)])
}

export function enqueueBackfillFollowerDistributions(): EnqueueReturnType {
  return enqueueBackfillFollowerDistributionsJob({}, {
    deduplication: {
      id: 'backfill_follower_distributions',
      mode: 'throttle',
      ttl: FOLLOWER_DISTRIBUTION_BACKFILL_DEDUPLICATION_TTL_MS,
    },
  } satisfies Partial<JobOptions>)
}

// A continuation carries the last id of the page before it. Its job id is that cursor, so a retried
// backfill cannot enqueue a second continuation, and a finished record releases the id.
export function enqueueBackfillFollowerDistributionsContinuation(
  afterId: string,
): EnqueueReturnType {
  return enqueueBackfillFollowerDistributionsJob({ afterId }, {
    jobId: `backfill_follower_distributions__${afterId}`,
    removeOnComplete: true,
    removeOnFail: true,
  } satisfies Partial<JobOptions>)
}

function processFollowerDistributionJobOptions(distributionId: string): Partial<JobOptions> {
  return {
    deduplication: {
      id: `process_follower_distribution__${distributionId}`,
      mode: 'debounce',
    },
  }
}
