import type {
  enqueueBulkReconcilePostNotifications,
  enqueueBulkReconcileRssFeedItemNotifications,
} from '@queues/notifications/enqueues'
import type { ReconciliationPost } from '@services/post-publication/reconcile'

export async function enqueuePostPublicationNotificationEffects(
  result: {
    posts: ReconciliationPost[]
    orphanReceiptPostIds: string[]
    missingPostIds: string[]
    rssFeedItemIds: string[]
  },
  dependencies: {
    enqueueBulkReconcilePostNotifications: typeof enqueueBulkReconcilePostNotifications
    enqueueBulkReconcileRssFeedItemNotifications: typeof enqueueBulkReconcileRssFeedItemNotifications
  },
): Promise<void> {
  const postIds = [
    ...new Set([
      ...result.posts.map(post => post.id),
      ...result.orphanReceiptPostIds,
      ...result.missingPostIds,
    ]),
  ]
  await Promise.all([
    postIds.length > 0
      ? dependencies.enqueueBulkReconcilePostNotifications(postIds)
      : Promise.resolve(),
    result.rssFeedItemIds.length > 0
      ? dependencies.enqueueBulkReconcileRssFeedItemNotifications(result.rssFeedItemIds)
      : Promise.resolve(),
  ])
}
