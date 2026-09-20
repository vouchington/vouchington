import { UnrecoverableError } from '@modules/queue-errors'
import { reconcileNotificationsForPost } from '@services/notifications/reconcile-post'
import { reconcileNotificationsForRssFeedItem } from '@services/notifications/reconcile-rss-feed-item'
import { deleteNotification } from '@services/notifications/mutations'
import { createFollowNotification } from '@services/notifications/create-follow-notification'
import { getFollowerInfoForNotification } from '@services/notifications/get-follower-info'
import { createReferralSignupNotification } from '@services/notifications/create-referral-signup-notification'
import { createReferralClickNotification } from '@services/notifications/create-referral-click-notification'
import { createDirectMessageNotification } from '@services/notifications/create-direct-message-notification'
import { createModmailNotification } from '@services/notifications/create-modmail-notification'
import { getConversationNotificationContext } from '@services/notifications/get-conversation-notification-context'
import { getPublicUserByAny } from '@services/users'
import { isUserBlockedOrMuted } from '@services/entity-relations'
import {
  enqueueBulkDeliverNotificationPushIntents,
  enqueueDeliverNotificationPushIntent,
  enqueueContinueNotificationPushIntentReconciliation,
  type ReconcileNotificationPushIntentsData,
} from '@queues/notifications/enqueues'
import { listAvailableNotificationPushIntents } from '@services/notifications-push'
import type { CreatedNotification } from '@services/notifications/reconcile-batches'

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
export {
  processDeliverCopyrightNotice,
  processReconcileCopyrightDeliveryIntents,
} from './processors/copyright-delivery.mts'
export {
  processApplyCopyrightAction,
  processReconcileCopyrightActionIntents,
} from './processors/copyright-action.mts'
export {
  processApplyMediaDeliveryRegistryRecord,
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

export async function processReconcilePostNotifications(
  data: { postId: string },
  dependencies?: Partial<NotificationProcessorDependencies>,
) {
  const reconcile = dependencies?.reconcileNotificationsForPost ?? reconcileNotificationsForPost
  return await reconcile(data.postId, {
    onCreatedNotifications: created => dispatchCreatedNotificationPushes(created, dependencies),
  })
}

export async function processReconcileRssFeedItemNotifications(
  data: { rssFeedItemId: string },
  dependencies?: Partial<NotificationProcessorDependencies>,
) {
  const reconcile =
    dependencies?.reconcileNotificationsForRssFeedItem ?? reconcileNotificationsForRssFeedItem
  return await reconcile(data.rssFeedItemId, {
    onCreatedNotifications: created => dispatchCreatedNotificationPushes(created, dependencies),
  })
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
  const intents = await listIntents(100, data)
  await Promise.all(intents.map(intent => enqueueIntent(intent.user_id, intent.notification_id)))
  const lastIntent = intents.at(-1)
  if (intents.length === 100 && lastIntent) {
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

  if (await isUserBlockedOrMuted(data.followeeId, data.followerId)) return

  const isReferralSignup = follower.referrer_id === data.followeeId
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

export async function processConversationMessageNotification(
  data: {
    conversationId: string
    messageId: string
    senderId: string
  },
  dependencies?: Partial<NotificationProcessorDependencies>,
) {
  const context = await getConversationNotificationContext(data.conversationId, data.senderId)
  if (!context) return

  // Modmail is official community communication — block/mute must not suppress it.
  let eligibleUserIds = context.participant_user_ids
  if (context.channel_type === 'direct_message') {
    const blockedFlags = await Promise.all(
      eligibleUserIds.map(userId => isUserBlockedOrMuted(userId, data.senderId)),
    )
    eligibleUserIds = eligibleUserIds.filter((_, i) => !blockedFlags[i])
  }

  const notificationResults = await Promise.all(
    eligibleUserIds.map(userId => {
      switch (context.channel_type) {
        case 'modmail': {
          if (!context.community_slug) {
            throw new UnrecoverableError('modmail conversation is missing community_slug')
          }
          const targetPath = `/messages/modmail/${context.community_slug}/${data.conversationId}`
          return createModmailNotification(userId, data.conversationId, targetPath)
        }
        case 'direct_message':
          return createDirectMessageNotification(userId, data.conversationId)
        default:
          throw new UnrecoverableError(`unknown channel_type: ${String(context.channel_type)}`)
      }
    }),
  )
  const allCreated = notificationResults.flat() as CreatedNotification[]
  await dispatchCreatedNotificationPushes(allCreated, dependencies)
}
