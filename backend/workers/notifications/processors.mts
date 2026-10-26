import { reconcileNotificationsForPost } from '@services/notifications/reconcile-post'
import { reconcileNotificationsForRssFeedItem } from '@services/notifications/reconcile-rss-feed-item'
import { deleteNotification } from '@services/notifications/mutations'
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

type NotificationProcessorDependencies = {
  enqueueBulkDeliverNotificationPushIntents: typeof enqueueBulkDeliverNotificationPushIntents
  enqueueContinueNotificationPushIntentReconciliation: typeof enqueueContinueNotificationPushIntentReconciliation
  enqueueDeliverNotificationPushIntent: typeof enqueueDeliverNotificationPushIntent
  listAvailableNotificationPushIntents: typeof listAvailableNotificationPushIntents
  reconcileNotificationsForPost: typeof reconcileNotificationsForPost
  reconcileNotificationsForRssFeedItem: typeof reconcileNotificationsForRssFeedItem
}

export {
  processCommunityActivityDigestBatch,
  processCommunityActivityDigestDispatch,
} from './processors/community-activity-digest.mts'
export { processDeliverNotificationPushIntent } from './processors/push-delivery.mts'
export { processConversationMessageNotification } from './processors/conversation.mts'
export {
  processDeliverCopyrightNotice,
  processReconcileCopyrightDeliveryIntents,
} from './processors/copyright-delivery.mts'
export { processApplyCopyrightAction } from './processors/copyright-action.mts'
export { processReconcileCopyrightActionIntents } from './processors/copyright-action-reconcile.mts'
export { processCheckCopyrightReviewTarget } from './processors/copyright-review-target.mts'
export { processSweepCopyrightEvidenceRetention } from './processors/copyright-evidence-retention.mts'
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
  dependencies?: Partial<NotificationProcessorDependencies>,
) {
  const enqueuePushes =
    dependencies?.enqueueBulkDeliverNotificationPushIntents ??
    enqueueBulkDeliverNotificationPushIntents
  await enqueuePushes(
    (createdNotifications ?? []).map(notification => ({
      userId: notification.user_id,
      notificationId: notification.id,
    })),
  )
}

/** One bounded page of the post's recipients; a full page queues the next page after its last id. */
export async function processReconcilePostNotifications(
  data: { postId: string; afterUserId?: string; pageSize?: number },
  dependencies?: Partial<NotificationProcessorDependencies>,
) {
  const reconcile = dependencies?.reconcileNotificationsForPost ?? reconcileNotificationsForPost
  const result = await reconcile(data.postId, {
    afterUserId: data.afterUserId,
    pageSize: data.pageSize,
    onCreatedNotifications: created => dispatchCreatedNotificationPushes(created, dependencies),
  })
  return result
}

/** One bounded page of the item's recipients; a full page queues the next page after its last id. */
export async function processReconcileRssFeedItemNotifications(
  data: { rssFeedItemId: string; afterUserId?: string; pageSize?: number },
  dependencies?: Partial<NotificationProcessorDependencies>,
) {
  const reconcile =
    dependencies?.reconcileNotificationsForRssFeedItem ?? reconcileNotificationsForRssFeedItem
  const result = await reconcile(data.rssFeedItemId, {
    afterUserId: data.afterUserId,
    pageSize: data.pageSize,
    onCreatedNotifications: created => dispatchCreatedNotificationPushes(created, dependencies),
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
  dependencies: Partial<NotificationProcessorDependencies> = {},
) {
  const listIntents =
    dependencies.listAvailableNotificationPushIntents ?? listAvailableNotificationPushIntents
  const enqueueIntent =
    dependencies.enqueueDeliverNotificationPushIntent ?? enqueueDeliverNotificationPushIntent
  const enqueueContinuation =
    dependencies.enqueueContinueNotificationPushIntentReconciliation ??
    enqueueContinueNotificationPushIntentReconciliation
  const pageSize = getNotificationsWorkLimit('push_intent_recovery_page_size')
  const intents = await listIntents(pageSize, data)
  await Promise.all(intents.map(intent => enqueueIntent(intent.user_id, intent.notification_id)))
  const lastIntent = intents.at(-1)
  if (intents.length === pageSize && lastIntent) {
    await enqueueContinuation({
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
  // ast-grep-ignore: no-three-sequential-awaits -- worker processor performs dependent side effects in order
  const user = await getPublicUserByAny(data.newUserId)
  const createdNotifications = await createReferralSignupNotification(
    data.referrerId,
    data.newUserId,
    user?.username ?? null,
  )
  await dispatchCreatedNotificationPushes(createdNotifications)
}

export async function processReferralClickNotification(data: {
  referrerId: string
  landingUrl: string
}) {
  const createdNotifications = await createReferralClickNotification(
    data.referrerId,
    data.landingUrl,
  )
  await dispatchCreatedNotificationPushes(createdNotifications)
}
