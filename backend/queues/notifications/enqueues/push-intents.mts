import { createBulkEnqueueFunction, createEnqueueFunction } from '@data-stores/valkey-glide-mq'
import type { EnqueueReturnType } from '@voucha/types'
import type { JobOptions } from 'glide-mq'
import { NOTIFICATIONS_DEDUPLICATION_TTL_MS, PRIORITY_DEFAULT, QUEUE_NAME } from '../config.mts'
import { notifications } from '../queues.mts'

type DeliverNotificationPushData = { userId: string; notificationId: string }
export type ReconcileNotificationPushIntentsData = {
  scanBefore?: string
  after?: { updatedAt: string; userId: string; notificationId: string }
}
const FIVE_MINUTES_MS = 5 * 60 * 1000

const enqueueDeliverNotificationPushIntentJob = createEnqueueFunction<
  DeliverNotificationPushData,
  'processDeliverNotificationPushIntent'
>({ queue: notifications, queueName: QUEUE_NAME, jobName: 'processDeliverNotificationPushIntent' })

const enqueueBulkDeliverNotificationPushIntentJobs = createBulkEnqueueFunction<
  DeliverNotificationPushData,
  DeliverNotificationPushData,
  'processDeliverNotificationPushIntent'
>({
  queue: notifications,
  queueName: QUEUE_NAME,
  jobName: 'processDeliverNotificationPushIntent',
  buildJob: data => ({
    data,
    opts: {
      deduplication: {
        id: `processDeliverNotificationPushIntent__${data.userId}__${data.notificationId}`,
        mode: 'debounce' as const,
        ttl: NOTIFICATIONS_DEDUPLICATION_TTL_MS,
      },
    },
  }),
})

const enqueueReconcileNotificationPushIntentsJob = createEnqueueFunction<
  ReconcileNotificationPushIntentsData,
  'processReconcileNotificationPushIntents'
>({
  queue: notifications,
  queueName: QUEUE_NAME,
  jobName: 'processReconcileNotificationPushIntents',
})

export function enqueueDeliverNotificationPushIntent(
  userId: string,
  notificationId: string,
): EnqueueReturnType {
  return enqueueDeliverNotificationPushIntentJob({ userId, notificationId }, {
    priority: PRIORITY_DEFAULT,
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
  return enqueueBulkDeliverNotificationPushIntentJobs(deduped, { priority: PRIORITY_DEFAULT })
}

/** Chains the next distinct page in one fixed recovery snapshot. */
export function enqueueContinueNotificationPushIntentReconciliation(
  data: Required<ReconcileNotificationPushIntentsData>,
): EnqueueReturnType {
  return enqueueReconcileNotificationPushIntentsJob(data, {
    priority: PRIORITY_DEFAULT,
    deduplication: {
      id: `processReconcileNotificationPushIntentsContinuation__${data.scanBefore}__${data.after.updatedAt}__${data.after.userId}__${data.after.notificationId}`,
      mode: 'throttle',
      ttl: FIVE_MINUTES_MS,
    },
  } satisfies Partial<JobOptions>)
}

export function enqueueReconcileNotificationPushIntents(): EnqueueReturnType {
  return enqueueReconcileNotificationPushIntentsJob({}, {
    priority: PRIORITY_DEFAULT,
    deduplication: {
      id: 'processReconcileNotificationPushIntents',
      mode: 'throttle',
      ttl: FIVE_MINUTES_MS,
    },
  } satisfies Partial<JobOptions>)
}
