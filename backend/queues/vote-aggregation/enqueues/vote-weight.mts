import type { EnqueueReturnType } from '@voucha/types'
import type { JobOptions } from 'glide-mq'
import { createBackgroundBulkEnqueue, createBackgroundEnqueue } from '@queues/background/enqueues'
import {
  VOTE_AGGREGATION_RECALCULATE_USER_VOTE_WEIGHT_JOB,
  VOTE_AGGREGATION_USER_ELECTION_FAN_OUT_JOB,
  VOTE_AGGREGATION_VOTE_WEIGHT_DISPATCHER_JOB,
  type UserElectionFanOutCursor,
} from '@queues/background/enqueues/vote-aggregation-jobs'
import { VOTE_WEIGHT_DEDUPLICATION_TTL_MS } from './config-vote-weight.mts'
import type { ProcessRecalculateUserVoteWeightData } from './types-vote-weight.mts'

const BACKFILL_DEDUPLICATION_TTL_MS = 60 * 60_000
type DispatcherOptions = {
  deduplicationId?: string
}

function buildRecalculateUserVoteWeightOptions(
  userId: string,
  forceRecalculate?: boolean,
): Partial<JobOptions> {
  return {
    deduplication: {
      id: `processRecalculateUserVoteWeight__${userId}${forceRecalculate ? '__force' : ''}`,
      mode: 'debounce',
      ttl: VOTE_WEIGHT_DEDUPLICATION_TTL_MS,
    },
  }
}

const enqueueRecalculateUserVoteWeightJob = createBackgroundEnqueue(
  VOTE_AGGREGATION_RECALCULATE_USER_VOTE_WEIGHT_JOB,
)

const enqueueBulkRecalculateUserVoteWeightJobs = createBackgroundBulkEnqueue(
  VOTE_AGGREGATION_RECALCULATE_USER_VOTE_WEIGHT_JOB,
  (data: ProcessRecalculateUserVoteWeightData) => ({
    data,
    opts: buildRecalculateUserVoteWeightOptions(data.userId, data.forceRecalculate),
  }),
)

const enqueueRecalculateVoteWeightDispatcherJob = createBackgroundEnqueue(
  VOTE_AGGREGATION_VOTE_WEIGHT_DISPATCHER_JOB,
)

const enqueueUserElectionFanOutJob = createBackgroundEnqueue(
  VOTE_AGGREGATION_USER_ELECTION_FAN_OUT_JOB,
)

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
    options?.deduplicationId
      ? {
          deduplication: {
            id: options.deduplicationId,
            mode: 'throttle' as const,
            ttl: BACKFILL_DEDUPLICATION_TTL_MS,
          },
        }
      : undefined,
  )
}

/**
 * Starts (cursor null) or continues one user's election fan-out. A start carries no job id, so a
 * second weight change after the first run began still gets its own full pass. A continuation's id
 * is its cursor: two runs that reach the same cursor read the same remaining votes once.
 */
export function enqueueUserElectionFanOut(
  userId: string,
  cursor: UserElectionFanOutCursor | null = null,
): EnqueueReturnType {
  return enqueueUserElectionFanOutJob(
    { userId, cursor },
    cursor
      ? { jobId: `userElectionFanOut__${userId}__${cursor.lane}__${cursor.afterId}` }
      : undefined,
  )
}
