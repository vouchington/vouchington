import { createBulkEnqueueFunction, createEnqueueFunction } from '@data-stores/valkey-glide-mq'
import type { EnqueueReturnType } from '@voucha/types'
import type { JobOptions } from 'glide-mq'
import {
  BACKFILL_DEDUPLICATION_TTL_MS,
  BLUESKY_FOLLOW_PROPAGATION_DEFAULTS,
  PRIORITY_BACKFILL,
  PRIORITY_DEFAULT,
  QUEUE_NAME,
  RECONCILE_FOLLOW_DEDUPLICATION_TTL_MS,
} from './config.mts'
import { blueskyFollowPropagation } from './queues.mts'

export type ReconcileFollowData = { followerUserId: string; followeeUserId: string }
export type DisconnectRequestedData = {
  userId: string
  blueskyDid: string
  linkAuthorizationId: string
}

export function disconnectRequestedJobOptions(data: DisconnectRequestedData): Partial<JobOptions> {
  const logicalId = `disconnect_${data.userId}_${data.linkAuthorizationId}`
  return {
    jobId: logicalId,
    priority: PRIORITY_DEFAULT,
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
    priority: PRIORITY_DEFAULT,
    deduplication: {
      id: `reconcile_${followerUserId}__${followeeUserId}`,
      mode: 'debounce',
      ttl: RECONCILE_FOLLOW_DEDUPLICATION_TTL_MS,
    },
  }
}

const enqueueReconcileFollowJob = createEnqueueFunction<ReconcileFollowData, 'reconcileFollow'>({
  defaults: BLUESKY_FOLLOW_PROPAGATION_DEFAULTS,
  queue: blueskyFollowPropagation,
  queueName: QUEUE_NAME,
  jobName: 'reconcileFollow',
})

// Used by the backfill processor to bulk-enqueue one reconcileFollow job per candidate pair
// (@services/bluesky-follows/backfill.mts). Each pair still gets its own debounce dedup id so a
// backfill run never collapses distinct pairs into a single job.
export const enqueueBulkReconcileBlueskyFollow = createBulkEnqueueFunction<
  ReconcileFollowData,
  ReconcileFollowData,
  'reconcileFollow'
>({
  defaults: BLUESKY_FOLLOW_PROPAGATION_DEFAULTS,
  queue: blueskyFollowPropagation,
  queueName: QUEUE_NAME,
  jobName: 'reconcileFollow',
  buildJob: data => ({
    data,
    opts: reconcileFollowJobOptions(data.followerUserId, data.followeeUserId),
  }),
})

const enqueueDisconnectRequestedJob = createEnqueueFunction<
  DisconnectRequestedData,
  'disconnectRequested'
>({
  defaults: BLUESKY_FOLLOW_PROPAGATION_DEFAULTS,
  queue: blueskyFollowPropagation,
  queueName: QUEUE_NAME,
  jobName: 'disconnectRequested',
})

export const enqueueBulkDisconnectRequested = createBulkEnqueueFunction<
  DisconnectRequestedData,
  DisconnectRequestedData,
  'disconnectRequested'
>({
  defaults: BLUESKY_FOLLOW_PROPAGATION_DEFAULTS,
  queue: blueskyFollowPropagation,
  queueName: QUEUE_NAME,
  jobName: 'disconnectRequested',
  buildJob: data => ({ data, opts: disconnectRequestedJobOptions(data) }),
})

const enqueueBackfillBlueskyFollowPropagationJob = createEnqueueFunction<
  Record<string, never>,
  'backfillBlueskyFollowPropagation'
>({
  defaults: BLUESKY_FOLLOW_PROPAGATION_DEFAULTS,
  queue: blueskyFollowPropagation,
  queueName: QUEUE_NAME,
  jobName: 'backfillBlueskyFollowPropagation',
})

const enqueueBackfillBlueskyDisconnectRequestsJob = createEnqueueFunction<
  Record<string, never>,
  'backfillBlueskyDisconnectRequests'
>({
  defaults: BLUESKY_FOLLOW_PROPAGATION_DEFAULTS,
  queue: blueskyFollowPropagation,
  queueName: QUEUE_NAME,
  jobName: 'backfillBlueskyDisconnectRequests',
})

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
    priority: PRIORITY_BACKFILL,
    deduplication: {
      id: 'backfill_bluesky_follow_propagation',
      mode: 'throttle',
      ttl: BACKFILL_DEDUPLICATION_TTL_MS,
    },
  } satisfies Partial<JobOptions>)
}

export function enqueueBackfillBlueskyDisconnectRequests(): EnqueueReturnType {
  return enqueueBackfillBlueskyDisconnectRequestsJob({}, {
    priority: PRIORITY_BACKFILL,
    deduplication: {
      id: 'backfill_bluesky_disconnect_requests',
      mode: 'throttle',
      ttl: BACKFILL_DEDUPLICATION_TTL_MS,
    },
  } satisfies Partial<JobOptions>)
}
