import { createBackgroundBulkEnqueue, createBackgroundEnqueue } from '@queues/background/enqueues'
import {
  NOTIFICATIONS_APPLY_COPYRIGHT_ACTION_JOB,
  NOTIFICATIONS_DELETE_JOB,
  NOTIFICATIONS_DELIVER_COPYRIGHT_NOTICE_JOB,
  NOTIFICATIONS_FOLLOW_JOB,
  NOTIFICATIONS_REFERRAL_CLICK_JOB,
  NOTIFICATIONS_REFERRAL_SIGNUP_JOB,
  NOTIFICATIONS_RECONCILE_COPYRIGHT_ACTION_JOB,
  NOTIFICATIONS_RECONCILE_COPYRIGHT_DELIVERY_JOB,
} from '@queues/background/enqueues/notifications-jobs'
import type { CopyrightSweepContinuation } from '@queues/background/enqueues/notifications-domain'
import type { EnqueueReturnType } from '@voucha/types'
import type { JobOptions } from 'glide-mq'
import { NOTIFICATIONS_DEDUPLICATION_TTL_MS } from './config.mts'

const FIVE_MINUTES_MS = 5 * 60 * 1000
type FollowNotificationData = { followeeId: string; followerId: string }

export {
  enqueueReplayMediaDeliveryRegistry,
  enqueueContinueMediaDeliveryRegistryStaging,
  enqueueBulkApplyMediaDeliveryRegistryRecords,
  enqueueReconcileMediaDeliveryRegistry,
  enqueueContinueMediaDeliveryRegistryReconciliation,
} from './enqueues/media-delivery-registry.mts'
export type {
  ReplayMediaDeliveryRegistryData,
  ReconcileMediaDeliveryRegistryData,
} from './enqueues/media-delivery-registry.mts'
export { enqueueCheckCopyrightReviewTarget } from './enqueues/copyright-review-target.mts'
export { enqueueSweepCopyrightEvidenceRetention } from './enqueues/copyright-evidence-retention.mts'
export {
  enqueueSubmitDsaStatementOfReasons,
  enqueueBulkSubmitDsaStatementOfReasons,
  enqueueReconcileDsaStatementSubmissions,
} from './enqueues/copyright-dsa-submission.mts'
export * from './enqueues/community-activity-digest.mts'
export * from './enqueues/push-intents.mts'
export * from './enqueues/reconcile-recipients.mts'

export const enqueueBulkFollowNotification = createBackgroundBulkEnqueue(
  NOTIFICATIONS_FOLLOW_JOB,
  (data: FollowNotificationData) => ({
    data,
    opts: {
      deduplication: {
        id: `processFollowNotification__${data.followeeId}__${data.followerId}`,
        mode: 'debounce' as const,
        ttl: NOTIFICATIONS_DEDUPLICATION_TTL_MS,
      },
    },
  }),
)
const enqueueReferralSignupNotificationJob = createBackgroundEnqueue(
  NOTIFICATIONS_REFERRAL_SIGNUP_JOB,
)
const enqueueReferralClickNotificationJob = createBackgroundEnqueue(
  NOTIFICATIONS_REFERRAL_CLICK_JOB,
)
const enqueueDeleteNotificationJob = createBackgroundEnqueue(NOTIFICATIONS_DELETE_JOB)
const enqueueDeliverCopyrightNoticeJob = createBackgroundEnqueue(
  NOTIFICATIONS_DELIVER_COPYRIGHT_NOTICE_JOB,
)
const enqueueReconcileCopyrightDeliveryIntentsJob = createBackgroundEnqueue(
  NOTIFICATIONS_RECONCILE_COPYRIGHT_DELIVERY_JOB,
)
const enqueueApplyCopyrightActionJob = createBackgroundEnqueue(
  NOTIFICATIONS_APPLY_COPYRIGHT_ACTION_JOB,
)
const enqueueReconcileCopyrightActionIntentsJob = createBackgroundEnqueue(
  NOTIFICATIONS_RECONCILE_COPYRIGHT_ACTION_JOB,
)

/** One batched add of `enqueueDeliverCopyrightNotice` jobs, each with its own dedup id. */
export const enqueueBulkDeliverCopyrightNotices = createBackgroundBulkEnqueue(
  NOTIFICATIONS_DELIVER_COPYRIGHT_NOTICE_JOB,
  (intentId: string) => ({
    data: { intentId },
    opts: copyrightDeliveryJobOptions(intentId),
  }),
)

/** One batched add of `enqueueApplyCopyrightAction` jobs, each with its own dedup id. */
export const enqueueBulkApplyCopyrightActions = createBackgroundBulkEnqueue(
  NOTIFICATIONS_APPLY_COPYRIGHT_ACTION_JOB,
  (intentId: string) => ({ data: { intentId }, opts: copyrightActionJobOptions(intentId) }),
)

export function enqueueReferralSignupNotification(
  referrerId: string,
  newUserId: string,
): EnqueueReturnType {
  return enqueueReferralSignupNotificationJob({ referrerId, newUserId }, {
    deduplication: {
      id: `processReferralSignupNotification__${referrerId}__${newUserId}`,
      mode: 'throttle',
      ttl: NOTIFICATIONS_DEDUPLICATION_TTL_MS,
    },
  } satisfies Partial<JobOptions>)
}

export function enqueueReferralClickNotification(
  referrerId: string,
  landingUrl: string,
): EnqueueReturnType {
  return enqueueReferralClickNotificationJob({ referrerId, landingUrl }, {
    deduplication: {
      id: `processReferralClickNotification__${referrerId}`,
      mode: 'debounce',
      ttl: FIVE_MINUTES_MS,
    },
  } satisfies Partial<JobOptions>)
}

export function enqueueDeleteNotification(
  userId: string,
  notificationId: string,
): EnqueueReturnType {
  return enqueueDeleteNotificationJob({ userId, notificationId }, {
    deduplication: {
      id: `processDeleteNotification__${userId}__${notificationId}`,
      mode: 'debounce',
      ttl: NOTIFICATIONS_DEDUPLICATION_TTL_MS,
    },
  } satisfies Partial<JobOptions>)
}

function copyrightDeliveryJobOptions(intentId: string): Partial<JobOptions> {
  return {
    deduplication: {
      id: `copyright-delivery:${intentId}:in-app`,
      mode: 'throttle',
      ttl: FIVE_MINUTES_MS,
    },
  }
}

export function enqueueDeliverCopyrightNotice(intentId: string): EnqueueReturnType {
  return enqueueDeliverCopyrightNoticeJob({ intentId }, copyrightDeliveryJobOptions(intentId))
}

export function enqueueReconcileCopyrightDeliveryIntents(
  data: CopyrightSweepContinuation = {},
): EnqueueReturnType {
  return enqueueReconcileCopyrightDeliveryIntentsJob(data, {
    deduplication: {
      id: `copyright-delivery-reconciliation:${JSON.stringify(data)}`,
      mode: 'throttle',
      ttl: FIVE_MINUTES_MS,
    },
  })
}

function copyrightActionJobOptions(intentId: string): Partial<JobOptions> {
  return {
    deduplication: {
      id: `copyright-action:${intentId}`,
      mode: 'throttle',
      ttl: FIVE_MINUTES_MS,
    },
  }
}

export function enqueueApplyCopyrightAction(intentId: string): EnqueueReturnType {
  return enqueueApplyCopyrightActionJob({ intentId }, copyrightActionJobOptions(intentId))
}

export function enqueueReconcileCopyrightActionIntents(
  data: CopyrightSweepContinuation = {},
): EnqueueReturnType {
  return enqueueReconcileCopyrightActionIntentsJob(data, {
    deduplication: {
      id: `copyright-action-reconciliation:${JSON.stringify(data)}`,
      mode: 'throttle',
      ttl: FIVE_MINUTES_MS,
    },
  })
}
