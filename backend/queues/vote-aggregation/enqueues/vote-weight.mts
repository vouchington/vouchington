import type { EnqueueReturnType } from '@voucha/types'
import type { JobOptions } from 'glide-mq'
import { enqueueBulkReactivatingFinished } from '@data-stores/valkey-glide-mq/enqueue-or-reactivate'
import { createBackgroundBulkEnqueue, createBackgroundEnqueue } from '@queues/background/enqueues'
import {
  VOTE_AGGREGATION_RECALCULATE_USER_VOTE_WEIGHT_JOB,
  VOTE_AGGREGATION_USER_ELECTION_FAN_OUT_JOB,
  VOTE_AGGREGATION_VOTE_WEIGHT_DISPATCHER_JOB,
  type UserElectionFanOutCursor,
} from '@queues/background/enqueues/vote-aggregation-jobs'
import { voteAggregation } from '../queues.mts'
import type { ProcessRecalculateUserVoteWeightData } from './types-vote-weight.mts'
import {
  buildBackfillDispatcherJobOptions,
  type VoteWeightDispatcherEnqueueOptions,
} from './vote-weight-dispatch.mts'

export {
  enqueueVoteWeightAgeMilestones,
  enqueueVoteWeightMembershipExpirations,
  enqueueVoteWeightFamilySourceChanges,
  enqueueVoteWeightDirtyMarkers,
} from './vote-weight-dispatch.mts'

type DispatcherOptions = VoteWeightDispatcherEnqueueOptions & {
  replayElectionsOnly?: boolean
}

function buildRecalculateUserVoteWeightOptions(
  userId: string,
  forceRecalculate?: boolean,
  replayElectionsOnly?: boolean,
): Partial<JobOptions> {
  return {
    jobId: replayElectionsOnly
      ? `voteWeight__${userId}__replay`
      : forceRecalculate
        ? `voteWeight__${userId}__force`
        : `voteWeight__${userId}__direct__${Date.now()}`,
  }
}

const enqueueRecalculateUserVoteWeightJob = createBackgroundEnqueue(
  VOTE_AGGREGATION_RECALCULATE_USER_VOTE_WEIGHT_JOB,
)

const enqueueBulkRecalculateUserVoteWeightJobs = createBackgroundBulkEnqueue(
  VOTE_AGGREGATION_RECALCULATE_USER_VOTE_WEIGHT_JOB,
  (data: ProcessRecalculateUserVoteWeightData) => ({
    data,
    opts: buildRecalculateUserVoteWeightOptions(
      data.userId,
      data.forceRecalculate,
      data.replayElectionsOnly,
    ),
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
  if (forceRecalculate)
    return enqueueRecalculateVoteWeightEvents([
      { userId, jobId: `voteWeight__${userId}__force`, forceRecalculate: true },
    ])
  return enqueueRecalculateUserVoteWeightJob(
    { userId },
    buildRecalculateUserVoteWeightOptions(userId),
  )
}

export function enqueueBulkRecalculateUserVoteWeight(
  userIds: string[],
  forceRecalculate?: boolean,
): EnqueueReturnType {
  if (forceRecalculate)
    return enqueueRecalculateVoteWeightEvents(
      userIds.map(userId => ({
        userId,
        jobId: `voteWeight__${userId}__force`,
        forceRecalculate: true,
      })),
    )
  return enqueueBulkRecalculateUserVoteWeightJobs(
    userIds.map(userId => ({ userId, forceRecalculate })),
  )
}

export type VoteWeightEvent = { userId: string; jobId: string; forceRecalculate?: boolean }
const enqueueVoteWeightEvents = createBackgroundBulkEnqueue(
  VOTE_AGGREGATION_RECALCULATE_USER_VOTE_WEIGHT_JOB,
  (event: VoteWeightEvent) => ({
    data: { userId: event.userId, forceRecalculate: event.forceRecalculate },
    opts: { jobId: event.jobId },
  }),
)

/** Stable signal IDs are recoverable after a completed or failed retained job. */
export function enqueueRecalculateVoteWeightEvents(events: VoteWeightEvent[]) {
  return enqueueBulkReactivatingFinished({
    queue: voteAggregation,
    inputs: events,
    jobIdOf: event => event.jobId,
    enqueueBulk: enqueueVoteWeightEvents,
  })
}

export function enqueueRecalculateVoteWeightDispatcher(
  afterId?: string | null,
  options?: DispatcherOptions,
): EnqueueReturnType {
  return enqueueRecalculateVoteWeightDispatcherJob(
    { afterId, replayElectionsOnly: options?.replayElectionsOnly },
    buildBackfillDispatcherJobOptions(options),
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
  options: Partial<JobOptions> = {},
): EnqueueReturnType {
  return enqueueUserElectionFanOutJob(
    { userId, cursor },
    {
      ...options,
      ...(cursor
        ? { jobId: `userElectionFanOut__${userId}__${cursor.lane}__${cursor.afterId}` }
        : {}),
      ...options,
    },
  )
}

/** Replays election targets without changing saved weights or administrator overrides. */
export function enqueueBulkElectionUpdateReplay(userIds: string[]): EnqueueReturnType {
  return enqueueBulkReactivatingFinished({
    queue: voteAggregation,
    inputs: userIds.map(userId => ({ userId, replayElectionsOnly: true })),
    jobIdOf: data => `voteWeight__${data.userId}__replay`,
    enqueueBulk: enqueueBulkRecalculateUserVoteWeightJobs,
  })
}
