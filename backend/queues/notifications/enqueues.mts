import { createBulkEnqueueFunction, createEnqueueFunction } from '@data-stores/valkey-glide-mq'
import type { EnqueueReturnType } from '@voucha/types'
import type { JobOptions } from 'glide-mq'
import { NOTIFICATIONS_DEDUPLICATION_TTL_MS, PRIORITY_DEFAULT, QUEUE_NAME } from './config.mts'
import { notifications } from './queues.mts'
const FIVE_MINUTES_MS = 5 * 60 * 1000
type FollowNotificationData = { followeeId: string; followerId: string }
type ReferralSignupData = { referrerId: string; newUserId: string }
type ReferralClickData = { referrerId: string; landingUrl: string }
type DeleteNotificationData = { userId: string; notificationId: string }
type ReconcilePostNotificationData = { postId: string }
type ReconcileRssFeedItemNotificationData = { rssFeedItemId: string }
const enqueueBulkFollowNotificationJobs = createBulkEnqueueFunction<
  FollowNotificationData,
  FollowNotificationData,
  'processFollowNotification'
>({
  queue: notifications,
  queueName: QUEUE_NAME,
  jobName: 'processFollowNotification',
  buildJob: data => ({
    data,
    opts: {
      deduplication: {
        id: `processFollowNotification__${data.followeeId}__${data.followerId}`,
        mode: 'debounce' as const,
        ttl: NOTIFICATIONS_DEDUPLICATION_TTL_MS,
      },
    },
  }),
})

const enqueueReferralSignupNotificationJob = createEnqueueFunction<
  ReferralSignupData,
  'processReferralSignupNotification'
>({
  queue: notifications,
  queueName: QUEUE_NAME,
  jobName: 'processReferralSignupNotification',
})

const enqueueReferralClickNotificationJob = createEnqueueFunction<
  ReferralClickData,
  'processReferralClickNotification'
>({
  queue: notifications,
  queueName: QUEUE_NAME,
  jobName: 'processReferralClickNotification',
})

const enqueueDeleteNotificationJob = createEnqueueFunction<
  DeleteNotificationData,
  'processDeleteNotification'
>({
  queue: notifications,
  queueName: QUEUE_NAME,
  jobName: 'processDeleteNotification',
})

const enqueueBulkReconcilePostNotificationJobs = createBulkEnqueueFunction<
  ReconcilePostNotificationData,
  ReconcilePostNotificationData,
  'processReconcilePostNotifications'
>({
  queue: notifications,
  queueName: QUEUE_NAME,
  jobName: 'processReconcilePostNotifications',
  buildJob: data => ({
    data,
    opts: {
      deduplication: {
        id: `processReconcilePostNotifications__${data.postId}`,
        mode: 'debounce' as const,
        ttl: NOTIFICATIONS_DEDUPLICATION_TTL_MS,
      },
    },
  }),
})

const enqueueBulkReconcileRssFeedItemNotificationJobs = createBulkEnqueueFunction<
  ReconcileRssFeedItemNotificationData,
  ReconcileRssFeedItemNotificationData,
  'processReconcileRssFeedItemNotifications'
>({
  queue: notifications,
  queueName: QUEUE_NAME,
  jobName: 'processReconcileRssFeedItemNotifications',
  buildJob: data => ({
    data,
    opts: {
      deduplication: {
        id: `processReconcileRssFeedItemNotifications__${data.rssFeedItemId}`,
        mode: 'debounce' as const,
        ttl: NOTIFICATIONS_DEDUPLICATION_TTL_MS,
      },
    },
  }),
})

export function enqueueBulkFollowNotification(pairs: FollowNotificationData[]): EnqueueReturnType {
  return enqueueBulkFollowNotificationJobs(pairs, { priority: PRIORITY_DEFAULT })
}

export function enqueueReferralSignupNotification(
  referrerId: string,
  newUserId: string,
): EnqueueReturnType {
  return enqueueReferralSignupNotificationJob({ referrerId, newUserId }, {
    priority: PRIORITY_DEFAULT,
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
    priority: PRIORITY_DEFAULT,
    deduplication: {
      id: `processReferralClickNotification__${referrerId}`,
      mode: 'debounce',
      ttl: FIVE_MINUTES_MS,
    },
  } satisfies Partial<JobOptions>)
}

export function enqueueReconcilePostNotifications(postId: string): EnqueueReturnType {
  return enqueueBulkReconcilePostNotifications([postId])
}

export function enqueueDeleteNotification(
  userId: string,
  notificationId: string,
): EnqueueReturnType {
  return enqueueDeleteNotificationJob({ userId, notificationId }, {
    priority: PRIORITY_DEFAULT,
    deduplication: {
      id: `processDeleteNotification__${userId}__${notificationId}`,
      mode: 'debounce',
      ttl: NOTIFICATIONS_DEDUPLICATION_TTL_MS,
    },
  } satisfies Partial<JobOptions>)
}

export function enqueueBulkReconcilePostNotifications(postIds: string[]): EnqueueReturnType {
  return enqueueBulkReconcilePostNotificationJobs(
    [...new Set(postIds)].map(postId => ({ postId })),
    { priority: PRIORITY_DEFAULT },
  )
}

export * from './enqueues/community-activity-digest.mts'
export * from './enqueues/push-intents.mts'

export function enqueueBulkReconcileRssFeedItemNotifications(
  rssFeedItemIds: string[],
): EnqueueReturnType {
  return enqueueBulkReconcileRssFeedItemNotificationJobs(
    [...new Set(rssFeedItemIds)].map(rssFeedItemId => ({ rssFeedItemId })),
    { priority: PRIORITY_DEFAULT },
  )
}
