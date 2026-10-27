import { reconcilePostMembershipVisibility } from '@services/notifications/reconcile-post'
import { reconcileRssFeedItemMembershipVisibility } from '@services/notifications/reconcile-rss-feed-item'
import { enqueueContinueMembershipVisibility } from '@queues/notifications/enqueues'
import type { ReconcileMembershipVisibilityData } from '@queues/background/enqueues/notifications-domain'

/** A continuation rechecks membership for only its current raw target page. */
export async function processReconcileMembershipVisibility(
  data: ReconcileMembershipVisibilityData,
) {
  const page =
    data.postId !== undefined
      ? await reconcilePostMembershipVisibility(data.postId, data.after)
      : await reconcileRssFeedItemMembershipVisibility(data.rssFeedItemId, data.after)
  if (page.nextCursor) {
    await enqueueContinueMembershipVisibility({ ...data, after: page.nextCursor })
  }
  return page
}
