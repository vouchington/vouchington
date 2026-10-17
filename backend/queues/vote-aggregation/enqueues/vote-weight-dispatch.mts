import type { EnqueueReturnType } from '@voucha/types'
import { createBackgroundEnqueue } from '@queues/background/enqueues'
import {
  VOTE_AGGREGATION_AGE_MILESTONES_JOB,
  VOTE_AGGREGATION_MEMBERSHIP_EXPIRATIONS_JOB,
  VOTE_AGGREGATION_FAMILY_SOURCE_CHANGES_JOB,
  VOTE_AGGREGATION_DIRTY_MARKERS_JOB,
} from '@queues/background/enqueues/vote-aggregation-jobs'

const BACKFILL_DEDUPLICATION_TTL_MS = 60 * 60_000

export type VoteWeightDispatcherEnqueueOptions = { deduplicationId?: string }

/** Operator roots share a one-hour throttle; scheduled pages and continuations do not. */
export function buildBackfillDispatcherJobOptions(options?: VoteWeightDispatcherEnqueueOptions) {
  return options?.deduplicationId
    ? {
        deduplication: {
          id: options.deduplicationId,
          mode: 'throttle' as const,
          ttl: BACKFILL_DEDUPLICATION_TTL_MS,
        },
      }
    : undefined
}

const enqueueAgeMilestonesJob = createBackgroundEnqueue(VOTE_AGGREGATION_AGE_MILESTONES_JOB)
const enqueueMembershipExpirationsJob = createBackgroundEnqueue(
  VOTE_AGGREGATION_MEMBERSHIP_EXPIRATIONS_JOB,
)
const enqueueFamilySourceChangesJob = createBackgroundEnqueue(
  VOTE_AGGREGATION_FAMILY_SOURCE_CHANGES_JOB,
)
const enqueueDirtyMarkersJob = createBackgroundEnqueue(VOTE_AGGREGATION_DIRTY_MARKERS_JOB)

export function enqueueVoteWeightAgeMilestones(
  data: Parameters<typeof enqueueAgeMilestonesJob>[0] = {},
  options?: VoteWeightDispatcherEnqueueOptions,
): EnqueueReturnType {
  return enqueueAgeMilestonesJob(data, buildBackfillDispatcherJobOptions(options))
}

export function enqueueVoteWeightMembershipExpirations(
  data: Parameters<typeof enqueueMembershipExpirationsJob>[0] = {},
  options?: VoteWeightDispatcherEnqueueOptions,
): EnqueueReturnType {
  return enqueueMembershipExpirationsJob(data, buildBackfillDispatcherJobOptions(options))
}

export function enqueueVoteWeightFamilySourceChanges(
  data: Parameters<typeof enqueueFamilySourceChangesJob>[0] = {},
  options?: VoteWeightDispatcherEnqueueOptions,
): EnqueueReturnType {
  return enqueueFamilySourceChangesJob(data, buildBackfillDispatcherJobOptions(options))
}

export function enqueueVoteWeightDirtyMarkers(
  data: Parameters<typeof enqueueDirtyMarkersJob>[0] = {},
  options?: VoteWeightDispatcherEnqueueOptions,
): EnqueueReturnType {
  return enqueueDirtyMarkersJob(data, buildBackfillDispatcherJobOptions(options))
}
