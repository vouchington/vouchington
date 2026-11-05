import { reconcileNotificationsForPost } from '@services/notifications/reconcile-post'
import { reconcileNotificationsForRssFeedItem } from '@services/notifications/reconcile-rss-feed-item'
import { deleteNotification, markAllNotificationsRead } from '@services/notifications/mutations'
import { createFollowNotification } from '@services/notifications/create-follow-notification'
import { getFollowerInfoForNotification } from '@services/notifications/get-follower-info'
import { createReferralSignupNotification } from '@services/notifications/create-referral-signup-notification'
import { createReferralClickNotification } from '@services/notifications/create-referral-click-notification'
import { getPublicUserByAny } from '@services/users'
import { areUsersBlockedOrMutedEitherWay } from '@services/entity-relations'
import {
  enqueueBulkDeliverNotificationPushIntents,
  enqueueDeliverNotificationPushIntent,
  enqueueContinueNotificationPushIntentReconciliation,
  enqueueContinueContentVisibility,
  type ReconcileNotificationPushIntentsData,
} from '@queues/notifications/enqueues'
import { listAvailableNotificationPushIntents } from '@services/notifications-push'
import type { CreatedNotification } from '@services/notifications/reconcile-batches'
import { getNotificationsWorkLimit } from '@services/notifications/work-limits'
import {
  reconcilePostContentNotificationVisibility,
  reconcileRssFeedItemContentNotificationVisibility,
} from '@services/notifications/content-visibility-writes'
import type { ReconcileContentVisibilityData } from '@queues/background/enqueues/notifications-domain'

export { processCommunityActivityDigestDispatch } from './processors/community-activity-digest.mts'
export { processDeliverNotificationPushIntent } from './processors/push-delivery.mts'
export { processConversationMessageNotification } from './processors/conversation.mts'
export { processReconcileMembershipVisibility } from './processors/membership-visibility.mts'
export {
  processDeliverCopyrightNotice,
  processReconcileCopyrightDeliveryIntents,
} from './processors/copyright-delivery.mts'
export { processApplyCopyrightAction } from './processors/copyright-action.mts'
export { processReconcileCopyrightActionIntents } from './processors/copyright-action-reconcile.mts'
export { processCheckCopyrightReviewTarget } from './processors/copyright-review-target.mts'
export { processCopyrightCasePurgeAdmission } from './processors/copyright-case-purge-admission.mts'
export {
  processSubmitDsaStatementOfReasons,
  processReconcileDsaStatementSubmissions,
} from './processors/copyright-dsa-submission.mts'
export {
  processApplyMediaDeliveryRegistryRecord,
  processReplayMediaDeliveryRegistry,
  processReconcileMediaDeliveryRegistry,
} from './processors/media-delivery-registry.mts'

async function dispatchCreatedNotificationPushes(
  createdNotifications: CreatedNotification[] | undefined,
) {
  await enqueueBulkDeliverNotificationPushIntents(
    (createdNotifications ?? []).map(notification => ({
      userId: notification.user_id,
      notificationId: notification.id,
    })),
  )
}

/** One bounded page of the post's recipients; a full page queues the next page after its last id. */
export async function processReconcilePostNotifications(data: {
  postId: string
  afterUserId?: string
  pageSize?: number
}) {
  const result = await reconcileNotificationsForPost(data.postId, {
    afterUserId: data.afterUserId,
    pageSize: data.pageSize,
    onCreatedNotifications: dispatchCreatedNotificationPushes,
  })
  return result
}

/** One bounded page of the item's recipients; a full page queues the next page after its last id. */
export async function processReconcileRssFeedItemNotifications(data: {
  rssFeedItemId: string
  afterUserId?: string
  pageSize?: number
}) {
  const result = await reconcileNotificationsForRssFeedItem(data.rssFeedItemId, {
    afterUserId: data.afterUserId,
    pageSize: data.pageSize,
    onCreatedNotifications: dispatchCreatedNotificationPushes,
  })
  return result
}

/** A continuation reads current eligibility again before updating its bounded page. */
export async function processReconcileContentVisibility(data: ReconcileContentVisibilityData) {
  const page =
    data.postId !== undefined
      ? await reconcilePostContentNotificationVisibility(data.postId, data.after)
      : await reconcileRssFeedItemContentNotificationVisibility(data.rssFeedItemId, data.after)
  if (page.nextCursor) {
    await enqueueContinueContentVisibility({ ...data, after: page.nextCursor })
  }
  return page
}

export async function processReconcileNotificationPushIntents(
  data: ReconcileNotificationPushIntentsData = {},
  notificationIds?: readonly string[],
  batchSize = getNotificationsWorkLimit('push_intent_recovery_page_size'),
) {
  const intents = await listAvailableNotificationPushIntents(batchSize, {
    ...data,
    notificationIds,
  })
  await Promise.all(
    intents.map(intent =>
      enqueueDeliverNotificationPushIntent(intent.user_id, intent.notification_id),
    ),
  )
  const lastIntent = intents.at(-1)
  if (intents.length === batchSize && lastIntent) {
    await enqueueContinueNotificationPushIntentReconciliation({
      scanBefore: lastIntent.scan_before,
      after: {
        updatedAt: lastIntent.updated_at,
        userId: lastIntent.user_id,
        notificationId: lastIntent.notification_id,
      },
    })
  }
  return { enqueued: intents.length }
}

export function processDeleteNotification(data: { userId: string; notificationId: string }) {
  return deleteNotification(data.userId, data.notificationId)
}

export function processMarkAllNotificationsRead(data: { userId: string; throughId: string }) {
  return markAllNotificationsRead(data.userId, data.throughId)
}

export async function processFollowNotification(data: { followeeId: string; followerId: string }) {
  const follower = await getFollowerInfoForNotification(data.followerId)
  if (!follower) return

  if (await areUsersBlockedOrMutedEitherWay(data.followeeId, data.followerId)) return

  const isReferralSignup = follower.referrer_user_id === data.followeeId
  const createdNotifications = await createFollowNotification(
    data.followeeId,
    data.followerId,
    follower.username,
    { isReferralSignup },
  )
  await dispatchCreatedNotificationPushes(createdNotifications)
}

export async function processReferralSignupNotification(data: {
  referrerId: string
  newUserId: string
}) {
  // ast-grep-ignore: no-three-sequential-awaits -- the loaded username supplies the referral notification; its created notification ids supply push dispatch
  const user = await getPublicUserByAny(data.newUserId)
  const createdNotifications = await createReferralSignupNotification(
    data.referrerId,
    data.newUserId,
    user?.username ?? null,
  )
  await dispatchCreatedNotificationPushes(createdNotifications)
}

export async function processReferralClickNotification(data: { referrerId: string }) {
  const createdNotifications = await createReferralClickNotification(data.referrerId)
  await dispatchCreatedNotificationPushes(createdNotifications)
}
