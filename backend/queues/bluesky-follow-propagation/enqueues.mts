import { createBackgroundBulkEnqueue, createBackgroundEnqueue } from '@queues/background/enqueues'
import {
  BLUESKY_FOLLOW_PROPAGATION_BACKFILL_DISCONNECTS_JOB,
  BLUESKY_FOLLOW_PROPAGATION_BACKFILL_FOLLOWS_JOB,
  BLUESKY_FOLLOW_PROPAGATION_DISCONNECT_REQUESTED_JOB,
  BLUESKY_FOLLOW_PROPAGATION_RECONCILE_FOLLOW_JOB,
  type DisconnectRequestedData,
  type ReconcileFollowData,
} from '@queues/background/enqueues/bluesky-follow-propagation-jobs'
import type { EnqueueReturnType } from '@voucha/types'
import type { JobOptions } from 'glide-mq'
import { BACKFILL_DEDUPLICATION_TTL_MS, RECONCILE_FOLLOW_DEDUPLICATION_TTL_MS } from './config.mts'

export type { DisconnectRequestedData, ReconcileFollowData }

export function disconnectRequestedJobOptions(data: DisconnectRequestedData): Partial<JobOptions> {
  const logicalId = `disconnect_${data.userId}_${data.linkAuthorizationId}`
  return {
    jobId: logicalId,
    deduplication: { id: logicalId, mode: 'simple' },
    removeOnComplete: true,
    removeOnFail: true,
  }
}

// Debounce (not simple/throttle) collapses a rapid follow/unfollow toggle for the same pair into
// one final-state reconcile: reconcileBlueskyFollow always re-derives desired state from
// relation__user__follow__user at run time rather than trusting job data, so only the *last*
// enqueue in a toggle burst needs to actually run — matches notification-reconcile.mts's
// established reconcile-shaped-job convention (see @queues/notifications/enqueues.mts), not the
// generic "External API" throttle row in queues/README.md's dedup table.
function reconcileFollowJobOptions(
  followerUserId: string,
  followeeUserId: string,
): Partial<JobOptions> {
  return {
    deduplication: {
      id: `reconcile_${followerUserId}__${followeeUserId}`,
      mode: 'debounce',
      ttl: RECONCILE_FOLLOW_DEDUPLICATION_TTL_MS,
    },
  }
}

const enqueueReconcileFollowJob = createBackgroundEnqueue(
  BLUESKY_FOLLOW_PROPAGATION_RECONCILE_FOLLOW_JOB,
)

// Used by the backfill processor to bulk-enqueue one reconcileFollow job per candidate pair
// (@services/bluesky-follows/backfill.mts). Each pair still gets its own debounce dedup id so a
// backfill run never collapses distinct pairs into a single job.
export const enqueueBulkReconcileBlueskyFollow = createBackgroundBulkEnqueue(
  BLUESKY_FOLLOW_PROPAGATION_RECONCILE_FOLLOW_JOB,
  (data: ReconcileFollowData) => ({
    data,
    opts: reconcileFollowJobOptions(data.followerUserId, data.followeeUserId),
  }),
)

const enqueueDisconnectRequestedJob = createBackgroundEnqueue(
  BLUESKY_FOLLOW_PROPAGATION_DISCONNECT_REQUESTED_JOB,
)

export const enqueueBulkDisconnectRequested = createBackgroundBulkEnqueue(
  BLUESKY_FOLLOW_PROPAGATION_DISCONNECT_REQUESTED_JOB,
  (data: DisconnectRequestedData) => ({ data, opts: disconnectRequestedJobOptions(data) }),
)

const enqueueBackfillBlueskyFollowPropagationJob = createBackgroundEnqueue(
  BLUESKY_FOLLOW_PROPAGATION_BACKFILL_FOLLOWS_JOB,
)

const enqueueBackfillBlueskyDisconnectRequestsJob = createBackgroundEnqueue(
  BLUESKY_FOLLOW_PROPAGATION_BACKFILL_DISCONNECTS_JOB,
)

/**
 * @public Retained provisionally under issue #1360; external production use is unconfirmed and this
 * export may be made private or removed after intended-use review. Evidence: `docs/overview/architecture/queues/bluesky-follow-propagation/README.md`.
 */
export function enqueueReconcileBlueskyFollow(
  followerUserId: string,
  followeeUserId: string,
): EnqueueReturnType {
  return enqueueReconcileFollowJob(
    { followerUserId, followeeUserId },
    reconcileFollowJobOptions(followerUserId, followeeUserId),
  )
}

export function enqueueDisconnectRequested(data: DisconnectRequestedData): EnqueueReturnType {
  return enqueueDisconnectRequestedJob(data, disconnectRequestedJobOptions(data))
}

export function enqueueBackfillBlueskyFollowPropagation(): EnqueueReturnType {
  return enqueueBackfillBlueskyFollowPropagationJob({}, {
    deduplication: {
      id: 'backfill_bluesky_follow_propagation',
      mode: 'throttle',
      ttl: BACKFILL_DEDUPLICATION_TTL_MS,
    },
  } satisfies Partial<JobOptions>)
}

// A continuation carries the last pair of the page before it. Its job id is that cursor, so a
// retried backfill cannot enqueue a second continuation, and a finished record releases the id.
export function enqueueBackfillBlueskyFollowPropagationContinuation(
  after: ReconcileFollowData,
): EnqueueReturnType {
  return enqueueBackfillBlueskyFollowPropagationJob({ after }, {
    jobId: `backfill_bluesky_follow_propagation__${after.followerUserId}__${after.followeeUserId}`,
    removeOnComplete: true,
    removeOnFail: true,
  } satisfies Partial<JobOptions>)
}

export function enqueueBackfillBlueskyDisconnectRequests(): EnqueueReturnType {
  return enqueueBackfillBlueskyDisconnectRequestsJob({}, {
    deduplication: {
      id: 'backfill_bluesky_disconnect_requests',
      mode: 'throttle',
      ttl: BACKFILL_DEDUPLICATION_TTL_MS,
    },
  } satisfies Partial<JobOptions>)
}

export function enqueueBackfillBlueskyDisconnectRequestsContinuation(
  afterId: string,
): EnqueueReturnType {
  return enqueueBackfillBlueskyDisconnectRequestsJob({ afterId }, {
    jobId: `backfill_bluesky_disconnect_requests__${afterId}`,
    removeOnComplete: true,
    removeOnFail: true,
  } satisfies Partial<JobOptions>)
}
