import { createBulkEnqueueFunction, createEnqueueFunction } from '@data-stores/valkey-glide-mq'
import type { EnqueueReturnType } from '@voucha/types'
import type { JobOptions } from 'glide-mq'
import {
  PRIORITY_DEFAULT,
  PRIORITY_DISPATCHER,
  QUEUE_NAME,
  VOTE_WEIGHT_DEDUPLICATION_TTL_MS,
} from './config.mts'
import { voteWeightQueue } from './queues.mts'
import type { ProcessRecalculateUserVoteWeightData, VoteWeightJobs } from './types.mts'

const RECALCULATE_JOB_NAME: VoteWeightJobs = 'processRecalculateUserVoteWeight'
const DISPATCHER_JOB_NAME: VoteWeightJobs = 'processRecalculateVoteWeightDispatcher'
const BACKFILL_DEDUPLICATION_TTL_MS = 60 * 60_000
type DispatcherOptions = {
  deduplicationId?: string
}

function buildRecalculateUserVoteWeightOptions(
  userId: string,
  forceRecalculate?: boolean,
): Partial<JobOptions> {
  return {
    priority: PRIORITY_DEFAULT,
    deduplication: {
      id: `processRecalculateUserVoteWeight__${userId}${forceRecalculate ? '__force' : ''}`,
      mode: 'debounce',
      ttl: VOTE_WEIGHT_DEDUPLICATION_TTL_MS,
    },
  }
}

const enqueueRecalculateUserVoteWeightJob = createEnqueueFunction<
  ProcessRecalculateUserVoteWeightData,
  VoteWeightJobs
>({
  queue: voteWeightQueue,
  queueName: QUEUE_NAME,
  jobName: RECALCULATE_JOB_NAME,
})

const enqueueBulkRecalculateUserVoteWeightJobs = createBulkEnqueueFunction<
  ProcessRecalculateUserVoteWeightData,
  ProcessRecalculateUserVoteWeightData,
  VoteWeightJobs
>({
  queue: voteWeightQueue,
  queueName: QUEUE_NAME,
  jobName: RECALCULATE_JOB_NAME,
  buildJob: data => ({
    data,
    opts: buildRecalculateUserVoteWeightOptions(data.userId, data.forceRecalculate),
  }),
})

const enqueueRecalculateVoteWeightDispatcherJob = createEnqueueFunction<
  { afterId?: string | null },
  VoteWeightJobs
>({
  queue: voteWeightQueue,
  queueName: QUEUE_NAME,
  jobName: DISPATCHER_JOB_NAME,
})

export function enqueueRecalculateUserVoteWeight(
  userId: string,
  forceRecalculate?: boolean,
): EnqueueReturnType {
  return enqueueRecalculateUserVoteWeightJob(
    { userId, forceRecalculate },
    buildRecalculateUserVoteWeightOptions(userId, forceRecalculate),
  )
}

export function enqueueBulkRecalculateUserVoteWeight(
  userIds: string[],
  forceRecalculate?: boolean,
): EnqueueReturnType {
  return enqueueBulkRecalculateUserVoteWeightJobs(
    userIds.map(userId => ({ userId, forceRecalculate })),
  )
}

export function enqueueRecalculateVoteWeightDispatcher(
  afterId?: string | null,
  options?: DispatcherOptions,
): EnqueueReturnType {
  return enqueueRecalculateVoteWeightDispatcherJob(
    { afterId },
    {
      priority: PRIORITY_DISPATCHER,
      ...(options?.deduplicationId && {
        deduplication: {
          id: options.deduplicationId,
          mode: 'throttle' as const,
          ttl: BACKFILL_DEDUPLICATION_TTL_MS,
        },
      }),
    },
  )
}
