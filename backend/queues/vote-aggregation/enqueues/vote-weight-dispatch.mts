import { createHash } from 'node:crypto'
import type { EnqueueReturnType } from '@voucha/types'
import { enqueueBulkReactivatingFinished } from '@data-stores/valkey-glide-mq/enqueue-or-reactivate'
import { createBackgroundBulkEnqueue, createBackgroundEnqueue } from '@queues/background/enqueues'
import {
  VOTE_AGGREGATION_AGE_MILESTONES_JOB,
  VOTE_AGGREGATION_MEMBERSHIP_EXPIRATIONS_JOB,
  VOTE_AGGREGATION_FAMILY_SOURCE_CHANGES_JOB,
  VOTE_AGGREGATION_DIRTY_MARKERS_JOB,
} from '@queues/background/enqueues/vote-aggregation-jobs'
import {
  safeAgeMilestonesData,
  safeDirtyMarkersData,
  safeFamilySourceChangesData,
  safeMembershipExpirationsData,
} from './vote-weight-dispatch-payloads.mts'
import type {
  VoteWeightAgeMilestonesData,
  VoteWeightMembershipExpirationsData,
  VoteWeightFamilySourceChangesData,
  VoteWeightDirtyMarkersData,
  VoteWeightDispatchWindow,
  VoteWeightRejectedEvidenceKeyset,
} from '@queues/background/enqueues/vote-weight-dispatch-types'
import { voteAggregation } from '../queues.mts'

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

/** A cursor owns one page. Include the exact window so later sweeps can revisit the same row. */
function continuationJobId(dispatcher: string, state: unknown): string {
  const hash = createHash('sha256').update(JSON.stringify(state)).digest('hex')
  return `voteWeightDispatch__${dispatcher}__${hash}`
}

function windowState(window: VoteWeightDispatchWindow | undefined) {
  return window ? [window.windowStart, window.windowEnd] : null
}

function keysetState(keyset: VoteWeightRejectedEvidenceKeyset | null | undefined) {
  if (keyset === undefined) return 'unstarted'
  return keyset ? [keyset.at, keyset.id, keyset.afterSourceId ?? null] : null
}

function ageJobId(data: VoteWeightAgeMilestonesData): string {
  return continuationJobId('age', [
    windowState(data.window),
    data.milestoneIndex ?? null,
    data.afterId ?? null,
  ])
}

function expirationJobId(data: VoteWeightMembershipExpirationsData): string {
  return continuationJobId('expiry', [windowState(data.window), keysetState(data.after)])
}

function familyJobId(data: VoteWeightFamilySourceChangesData): string {
  return continuationJobId('family', [
    windowState(data.window),
    keysetState(data.branches?.updated_at),
    keysetState(data.branches?.effective_at),
    keysetState(data.branches?.expires_at),
    keysetState(data.branches?.rejected_at),
  ])
}

function dirtyJobId(data: VoteWeightDirtyMarkersData): string {
  return continuationJobId('dirty', data.afterId)
}

const enqueueBulkAgeContinuations = createBackgroundBulkEnqueue(
  VOTE_AGGREGATION_AGE_MILESTONES_JOB,
  (data: VoteWeightAgeMilestonesData) => ({ data, opts: { jobId: ageJobId(data) } }),
)
const enqueueBulkExpirationContinuations = createBackgroundBulkEnqueue(
  VOTE_AGGREGATION_MEMBERSHIP_EXPIRATIONS_JOB,
  (data: VoteWeightMembershipExpirationsData) => ({ data, opts: { jobId: expirationJobId(data) } }),
)
const enqueueBulkFamilyContinuations = createBackgroundBulkEnqueue(
  VOTE_AGGREGATION_FAMILY_SOURCE_CHANGES_JOB,
  (data: VoteWeightFamilySourceChangesData) => ({ data, opts: { jobId: familyJobId(data) } }),
)
const enqueueBulkDirtyContinuations = createBackgroundBulkEnqueue(
  VOTE_AGGREGATION_DIRTY_MARKERS_JOB,
  (data: VoteWeightDirtyMarkersData) => ({ data, opts: { jobId: dirtyJobId(data) } }),
)

export function enqueueVoteWeightAgeMilestones(
  data: Parameters<typeof enqueueAgeMilestonesJob>[0] = {},
  options?: VoteWeightDispatcherEnqueueOptions,
): EnqueueReturnType {
  if (data.window && (data.milestoneIndex !== undefined || data.afterId !== undefined)) {
    const safeData = safeAgeMilestonesData(data)
    return enqueueBulkReactivatingFinished({
      queue: voteAggregation,
      inputs: [safeData],
      jobIdOf: () => ageJobId(safeData),
      enqueueBulk: inputs => enqueueBulkAgeContinuations(inputs.map(safeAgeMilestonesData)),
    }).then(jobs => jobs[0] ?? null)
  }
  return enqueueAgeMilestonesJob(data, buildBackfillDispatcherJobOptions(options))
}

export function enqueueVoteWeightMembershipExpirations(
  data: Parameters<typeof enqueueMembershipExpirationsJob>[0] = {},
  options?: VoteWeightDispatcherEnqueueOptions,
): EnqueueReturnType {
  if (data.window && data.after) {
    const safeData = safeMembershipExpirationsData(data)
    return enqueueBulkReactivatingFinished({
      queue: voteAggregation,
      inputs: [safeData],
      jobIdOf: () => expirationJobId(safeData),
      enqueueBulk: inputs =>
        enqueueBulkExpirationContinuations(inputs.map(safeMembershipExpirationsData)),
    }).then(jobs => jobs[0] ?? null)
  }
  return enqueueMembershipExpirationsJob(data, buildBackfillDispatcherJobOptions(options))
}

export function enqueueVoteWeightFamilySourceChanges(
  data: Parameters<typeof enqueueFamilySourceChangesJob>[0] = {},
  options?: VoteWeightDispatcherEnqueueOptions,
): EnqueueReturnType {
  if (data.window && data.branches) {
    const safeData = safeFamilySourceChangesData(data)
    return enqueueBulkReactivatingFinished({
      queue: voteAggregation,
      inputs: [safeData],
      jobIdOf: () => familyJobId(safeData),
      enqueueBulk: inputs =>
        enqueueBulkFamilyContinuations(inputs.map(safeFamilySourceChangesData)),
    }).then(jobs => jobs[0] ?? null)
  }
  return enqueueFamilySourceChangesJob(data, buildBackfillDispatcherJobOptions(options))
}

export function enqueueVoteWeightDirtyMarkers(
  data: Parameters<typeof enqueueDirtyMarkersJob>[0] = {},
  options?: VoteWeightDispatcherEnqueueOptions,
): EnqueueReturnType {
  if (data.afterId) {
    const safeData = safeDirtyMarkersData(data)
    return enqueueBulkReactivatingFinished({
      queue: voteAggregation,
      inputs: [safeData],
      jobIdOf: () => dirtyJobId(safeData),
      enqueueBulk: inputs => enqueueBulkDirtyContinuations(inputs.map(safeDirtyMarkersData)),
    }).then(jobs => jobs[0] ?? null)
  }
  return enqueueDirtyMarkersJob(data, buildBackfillDispatcherJobOptions(options))
}
