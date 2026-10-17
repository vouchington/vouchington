import { PRIORITY_DISPATCH } from '@queues/background/config'
import { createBackgroundBulkEnqueue, createBackgroundEnqueue } from '@queues/background/enqueues'
import {
  NOTIFICATIONS_RECONCILE_POST_JOB,
  NOTIFICATIONS_RECONCILE_RSS_FEED_ITEM_JOB,
} from '@queues/background/enqueues/notifications-jobs'
import type { EnqueueReturnType } from '@voucha/types'
import { NOTIFICATIONS_DEDUPLICATION_TTL_MS } from '../config.mts'

type ReconcilePostData = { postId: string; afterUserId?: string }
type ReconcileRssFeedItemData = { rssFeedItemId: string; afterUserId?: string }

/** A continuation is its own job: a page id never joins the debounce of the root reconcile. */
const CONTINUATION = {
  priority: PRIORITY_DISPATCH,
  removeOnComplete: true,
  removeOnFail: true,
} as const

const enqueueBulkReconcilePostNotificationJobs = createBackgroundBulkEnqueue(
  NOTIFICATIONS_RECONCILE_POST_JOB,
  (data: ReconcilePostData) => ({
    data,
    opts: {
      deduplication: {
        id: `processReconcilePostNotifications__${data.postId}`,
        mode: 'debounce' as const,
        ttl: NOTIFICATIONS_DEDUPLICATION_TTL_MS,
      },
    },
  }),
)
const enqueueReconcilePostContinuationJob = createBackgroundEnqueue(
  NOTIFICATIONS_RECONCILE_POST_JOB,
)

const enqueueBulkReconcileRssFeedItemNotificationJobs = createBackgroundBulkEnqueue(
  NOTIFICATIONS_RECONCILE_RSS_FEED_ITEM_JOB,
  (data: ReconcileRssFeedItemData) => ({
    data,
    opts: {
      deduplication: {
        id: `processReconcileRssFeedItemNotifications__${data.rssFeedItemId}`,
        mode: 'debounce' as const,
        ttl: NOTIFICATIONS_DEDUPLICATION_TTL_MS,
      },
    },
  }),
)
const enqueueReconcileRssFeedItemContinuationJob = createBackgroundEnqueue(
  NOTIFICATIONS_RECONCILE_RSS_FEED_ITEM_JOB,
)

export function enqueueReconcilePostNotifications(postId: string): EnqueueReturnType {
  return enqueueBulkReconcilePostNotifications([postId])
}

export function enqueueBulkReconcilePostNotifications(postIds: string[]): EnqueueReturnType {
  return enqueueBulkReconcilePostNotificationJobs([...new Set(postIds)].map(postId => ({ postId })))
}

/** Queues the next recipient page of one post's reconciliation, after the last user of this page. */
export function enqueueContinueReconcilePostNotifications(
  data: Required<ReconcilePostData>,
): EnqueueReturnType {
  return enqueueReconcilePostContinuationJob(data, {
    ...CONTINUATION,
    jobId: `notifications__reconcile-post__${data.postId}__${data.afterUserId}`,
  })
}

export function enqueueBulkReconcileRssFeedItemNotifications(
  rssFeedItemIds: string[],
): EnqueueReturnType {
  return enqueueBulkReconcileRssFeedItemNotificationJobs(
    [...new Set(rssFeedItemIds)].map(rssFeedItemId => ({ rssFeedItemId })),
  )
}

/** Queues the next recipient page of one RSS feed item's reconciliation. */
export function enqueueContinueReconcileRssFeedItemNotifications(
  data: Required<ReconcileRssFeedItemData>,
): EnqueueReturnType {
  return enqueueReconcileRssFeedItemContinuationJob(data, {
    ...CONTINUATION,
    jobId: `notifications__reconcile-rss-feed-item__${data.rssFeedItemId}__${data.afterUserId}`,
  })
}
