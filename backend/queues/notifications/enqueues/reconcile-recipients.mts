import { enqueueBulkReactivatingFinished } from '@data-stores/valkey-glide-mq/enqueue-or-reactivate'
import { getBackgroundOrderingConcurrency, PRIORITY_DISPATCH } from '@queues/background/config'
import { createBackgroundBulkEnqueue } from '@queues/background/enqueues'
import {
  NOTIFICATIONS_CONTENT_VISIBILITY_JOB,
  NOTIFICATIONS_MEMBERSHIP_VISIBILITY_JOB,
  NOTIFICATIONS_RECONCILE_POST_JOB,
  NOTIFICATIONS_RECONCILE_RSS_FEED_ITEM_JOB,
} from '@queues/background/enqueues/notifications-jobs'
import type {
  ReconcileContentVisibilityData,
  ReconcileMembershipVisibilityData,
  ReconcilePostNotificationsData,
  ReconcileRssFeedItemNotificationsData,
} from '@queues/background/enqueues/notifications-domain'
import { background } from '@queues/background/queues'
import type { JobOptions } from 'glide-mq'

const CONTINUATION = { priority: PRIORITY_DISPATCH, removeOnComplete: true, removeOnFail: true }

function bulkOrdering(kind: 'post' | 'rss', entityId: string) {
  return {
    key: `notifications:bulk:${kind}:${entityId}`,
    concurrency: getBackgroundOrderingConcurrency('notifications:bulk'),
  }
}

function postJobId(data: ReconcilePostNotificationsData): string {
  return `notifications__reconcile-post__${data.postId}__${data.changeId}__${data.afterUserId ?? 'root'}`
}

function rssJobId(data: ReconcileRssFeedItemNotificationsData): string {
  return `notifications__reconcile-rss-feed-item__${data.rssFeedItemId}__${data.changeId}__${data.afterUserId ?? 'root'}`
}

function visibilityJobId(data: ReconcileContentVisibilityData): string {
  const kind = data.postId ? 'post' : 'rss'
  const entityId = data.postId ?? data.rssFeedItemId
  return `notifications__content-visibility__${kind}__${entityId}__${data.changeId}__${data.after.userId}__${data.after.notificationId}`
}

function membershipJobId(data: ReconcileMembershipVisibilityData): string {
  const kind = data.postId ? 'post' : 'rss'
  const entityId = data.postId ?? data.rssFeedItemId
  return `notifications__membership-visibility__${kind}__${entityId}__${data.changeId}__${data.after.userId}__${data.after.notificationId}`
}

const enqueuePostJobs = createBackgroundBulkEnqueue(
  NOTIFICATIONS_RECONCILE_POST_JOB,
  (data: ReconcilePostNotificationsData) => ({
    data,
    opts: {
      jobId: postJobId(data),
      ordering: bulkOrdering('post', data.postId),
      ...(data.afterUserId ? CONTINUATION : {}),
    },
  }),
)
const enqueueRssJobs = createBackgroundBulkEnqueue(
  NOTIFICATIONS_RECONCILE_RSS_FEED_ITEM_JOB,
  (data: ReconcileRssFeedItemNotificationsData) => ({
    data,
    opts: {
      jobId: rssJobId(data),
      ordering: bulkOrdering('rss', data.rssFeedItemId),
      ...(data.afterUserId ? CONTINUATION : {}),
    },
  }),
)
const enqueueVisibilityJobs = createBackgroundBulkEnqueue(
  NOTIFICATIONS_CONTENT_VISIBILITY_JOB,
  (data: ReconcileContentVisibilityData) => ({
    data,
    opts: {
      jobId: visibilityJobId(data),
      ordering: bulkOrdering(data.postId ? 'post' : 'rss', data.postId ?? data.rssFeedItemId),
      ...CONTINUATION,
    },
  }),
)
const enqueueMembershipJobs = createBackgroundBulkEnqueue(
  NOTIFICATIONS_MEMBERSHIP_VISIBILITY_JOB,
  (data: ReconcileMembershipVisibilityData) => ({
    data,
    opts: {
      jobId: membershipJobId(data),
      ordering: bulkOrdering(data.postId ? 'post' : 'rss', data.postId ?? data.rssFeedItemId),
      ...CONTINUATION,
    },
  }),
)

/** Each accepted producer change gets a distinct root, including while a prior root is active. */
export function enqueueReconcilePostNotifications(postId: string, changeId: string) {
  return enqueueBulkReconcilePostNotifications([postId], changeId)
}

export function enqueueBulkReconcilePostNotifications(postIds: string[], changeId: string) {
  const inputs = [...new Set(postIds)].map(postId => ({ postId, changeId }))
  return enqueueBulkReactivatingFinished({
    queue: background,
    inputs,
    jobIdOf: postJobId,
    enqueueBulk: enqueuePostJobs,
  })
}

function continuationOptions(options?: Partial<JobOptions>): Partial<JobOptions> | undefined {
  if (!options) return undefined
  // The dispatcher supplies retry and admission-fence options. The page's accepted change and
  // cursor remain its stable identity, and every page stays on the item's serial bulk lane.
  const { jobId: _jobId, ordering: _ordering, ...rest } = options
  return rest
}

export function enqueueContinueReconcilePostNotifications(
  data: ReconcilePostNotificationsData,
  options?: Partial<JobOptions>,
) {
  return enqueueBulkReactivatingFinished({
    queue: background,
    inputs: [data],
    jobIdOf: postJobId,
    enqueueBulk: inputs => enqueuePostJobs(inputs, continuationOptions(options)),
  })
}

export function enqueueBulkReconcileRssFeedItemNotifications(
  rssFeedItemIds: string[],
  changeId: string,
) {
  const inputs = [...new Set(rssFeedItemIds)].map(rssFeedItemId => ({ rssFeedItemId, changeId }))
  return enqueueBulkReactivatingFinished({
    queue: background,
    inputs,
    jobIdOf: rssJobId,
    enqueueBulk: enqueueRssJobs,
  })
}

export function enqueueContinueReconcileRssFeedItemNotifications(
  data: ReconcileRssFeedItemNotificationsData,
  options?: Partial<JobOptions>,
) {
  return enqueueBulkReactivatingFinished({
    queue: background,
    inputs: [data],
    jobIdOf: rssJobId,
    enqueueBulk: inputs => enqueueRssJobs(inputs, continuationOptions(options)),
  })
}

export function enqueueContinueContentVisibility(data: ReconcileContentVisibilityData) {
  return enqueueBulkReactivatingFinished({
    queue: background,
    inputs: [data],
    jobIdOf: visibilityJobId,
    enqueueBulk: enqueueVisibilityJobs,
  })
}

export function enqueueContinueMembershipVisibility(data: ReconcileMembershipVisibilityData) {
  return enqueueBulkReactivatingFinished({
    queue: background,
    inputs: [data],
    jobIdOf: membershipJobId,
    enqueueBulk: enqueueMembershipJobs,
  })
}
