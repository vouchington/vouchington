import { PRIORITY_DISPATCH, PRIORITY_TASK } from '../config.mts'
import { defineBackgroundDomain, defineBackgroundJob } from './define-job.mts'

// Serialize Bluesky refresh-token rotation across replicas so a stale write cannot replace a rotated session.
export const BLUESKY_FOLLOW_PROPAGATION_DOMAIN = defineBackgroundDomain({
  domain: 'bluesky-follow-propagation',
  workerConcurrency: 1,
})

export type ReconcileFollowData = { followerUserId: string; followeeUserId: string }
export type DisconnectRequestedData = {
  userId: string
  blueskyDid: string
  linkAuthorizationId: string
}
/** One page of follow pairs after the cursor pair; the first page has no cursor. */
export type BackfillBlueskyFollowPropagationData = { after?: ReconcileFollowData }
/** One page of pending disconnects after `afterId`; the first page has no cursor. */
export type BackfillBlueskyDisconnectRequestsData = { afterId?: string }

const DEFAULTS = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 5000, jitter: 0.5 },
  removeOnComplete: 100,
  removeOnFail: 100,
} as const

export const BLUESKY_FOLLOW_PROPAGATION_RECONCILE_FOLLOW_JOB =
  defineBackgroundJob<ReconcileFollowData>(BLUESKY_FOLLOW_PROPAGATION_DOMAIN, {
    name: 'reconcileFollow',
    priority: PRIORITY_TASK,
    ...DEFAULTS,
  })
export const BLUESKY_FOLLOW_PROPAGATION_DISCONNECT_REQUESTED_JOB =
  defineBackgroundJob<DisconnectRequestedData>(BLUESKY_FOLLOW_PROPAGATION_DOMAIN, {
    name: 'disconnectRequested',
    priority: PRIORITY_TASK,
    ...DEFAULTS,
  })
export const BLUESKY_FOLLOW_PROPAGATION_BACKFILL_FOLLOWS_JOB =
  defineBackgroundJob<BackfillBlueskyFollowPropagationData>(BLUESKY_FOLLOW_PROPAGATION_DOMAIN, {
    name: 'backfillBlueskyFollowPropagation',
    priority: PRIORITY_DISPATCH,
    ...DEFAULTS,
  })
export const BLUESKY_FOLLOW_PROPAGATION_BACKFILL_DISCONNECTS_JOB =
  defineBackgroundJob<BackfillBlueskyDisconnectRequestsData>(BLUESKY_FOLLOW_PROPAGATION_DOMAIN, {
    name: 'backfillBlueskyDisconnectRequests',
    priority: PRIORITY_DISPATCH,
    ...DEFAULTS,
  })

export const BLUESKY_FOLLOW_PROPAGATION_JOBS = [
  BLUESKY_FOLLOW_PROPAGATION_RECONCILE_FOLLOW_JOB,
  BLUESKY_FOLLOW_PROPAGATION_DISCONNECT_REQUESTED_JOB,
  BLUESKY_FOLLOW_PROPAGATION_BACKFILL_FOLLOWS_JOB,
  BLUESKY_FOLLOW_PROPAGATION_BACKFILL_DISCONNECTS_JOB,
] as const
