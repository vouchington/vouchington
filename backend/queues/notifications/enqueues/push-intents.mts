import { createBackgroundBulkEnqueue, createBackgroundEnqueue } from '@queues/background/enqueues'
import type {
  DeliverNotificationPushData,
  ReconcileNotificationPushIntentsData,
} from '@queues/background/enqueues/notifications-domain'
import {
  NOTIFICATIONS_DELIVER_PUSH_INTENT_JOB,
  NOTIFICATIONS_RECONCILE_PUSH_INTENTS_JOB,
} from '@queues/background/enqueues/notifications-jobs'
import type { EnqueueReturnType } from '@voucha/types'
import type { JobOptions } from 'glide-mq'
import { NOTIFICATIONS_DEDUPLICATION_TTL_MS } from '../config.mts'

export type { ReconcileNotificationPushIntentsData }
const FIVE_MINUTES_MS = 5 * 60 * 1000

const enqueueDeliverNotificationPushIntentJob = createBackgroundEnqueue(
  NOTIFICATIONS_DELIVER_PUSH_INTENT_JOB,
)

const enqueueBulkDeliverNotificationPushIntentJobs = createBackgroundBulkEnqueue(
  NOTIFICATIONS_DELIVER_PUSH_INTENT_JOB,
  (data: DeliverNotificationPushData) => ({
    data,
    opts: {
      deduplication: {
        id: `processDeliverNotificationPushIntent__${data.userId}__${data.notificationId}`,
        mode: 'debounce' as const,
        ttl: NOTIFICATIONS_DEDUPLICATION_TTL_MS,
      },
    },
  }),
)

const enqueueReconcileNotificationPushIntentsJob = createBackgroundEnqueue(
  NOTIFICATIONS_RECONCILE_PUSH_INTENTS_JOB,
)

export function enqueueDeliverNotificationPushIntent(
  userId: string,
  notificationId: string,
): EnqueueReturnType {
  return enqueueDeliverNotificationPushIntentJob({ userId, notificationId }, {
    deduplication: {
      id: `processDeliverNotificationPushIntent__${userId}__${notificationId}`,
      mode: 'debounce',
      ttl: NOTIFICATIONS_DEDUPLICATION_TTL_MS,
    },
  } satisfies Partial<JobOptions>)
}

export function enqueueBulkDeliverNotificationPushIntents(
  notificationsToDeliver: DeliverNotificationPushData[],
): EnqueueReturnType {
  const deduped = [
    ...new Map(
      notificationsToDeliver.map(item => [`${item.userId}::${item.notificationId}`, item]),
    ).values(),
  ]
  return enqueueBulkDeliverNotificationPushIntentJobs(deduped)
}

/** Chains the next distinct page in one fixed recovery snapshot. */
export function enqueueContinueNotificationPushIntentReconciliation(
  data: Required<ReconcileNotificationPushIntentsData>,
): EnqueueReturnType {
  return enqueueReconcileNotificationPushIntentsJob(data, {
    deduplication: {
      id: `processReconcileNotificationPushIntentsContinuation__${data.scanBefore}__${data.after.updatedAt}__${data.after.userId}__${data.after.notificationId}`,
      mode: 'throttle',
      ttl: FIVE_MINUTES_MS,
    },
  } satisfies Partial<JobOptions>)
}

export function enqueueReconcileNotificationPushIntents(): EnqueueReturnType {
  return enqueueReconcileNotificationPushIntentsJob({}, {
    deduplication: {
      id: 'processReconcileNotificationPushIntents',
      mode: 'throttle',
      ttl: FIVE_MINUTES_MS,
    },
  } satisfies Partial<JobOptions>)
}
