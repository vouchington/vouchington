import { UnrecoverableError } from '@vouchington/queue-errors'
import { createDirectMessageNotifications } from '@services/notifications/create-direct-message-notification'
import { createModmailNotifications } from '@services/notifications/create-modmail-notification'
import { getConversationNotificationContext } from '@services/notifications/get-conversation-notification-context'
import { getUserIdsBlockedOrMutedEitherWay } from '@services/entity-relations'
import { enqueueBulkDeliverNotificationPushIntents } from '@queues/notifications/enqueues'
import type { CreatedNotification } from '@services/notifications/reconcile-batches'

async function dispatchPushes(created: CreatedNotification[]): Promise<void> {
  await enqueueBulkDeliverNotificationPushIntents(
    created.map(notification => ({
      userId: notification.user_id,
      notificationId: notification.id,
    })),
  )
}

export async function processConversationMessageNotification(data: {
  conversationId: string
  messageId: string
  senderId: string
}) {
  const context = await getConversationNotificationContext(data.conversationId, data.senderId)
  if (!context) return

  // Modmail is official community communication — block/mute must not suppress it.
  let eligibleUserIds = context.participant_user_ids
  if (context.channel_type === 'direct_message') {
    const blockedIds = await getUserIdsBlockedOrMutedEitherWay(data.senderId, eligibleUserIds)
    eligibleUserIds = eligibleUserIds.filter(userId => !blockedIds.has(userId))
  }

  if (eligibleUserIds.length === 0) {
    await dispatchPushes([])
    return
  }
  let allCreated: CreatedNotification[]
  switch (context.channel_type) {
    case 'modmail': {
      if (!context.community_slug) {
        throw new UnrecoverableError('modmail conversation is missing community_slug')
      }
      const targetPath = `/messages/modmail/${context.community_slug}/${data.conversationId}`
      allCreated = await createModmailNotifications(
        eligibleUserIds,
        data.conversationId,
        targetPath,
      )
      break
    }
    case 'direct_message':
      allCreated = await createDirectMessageNotifications(eligibleUserIds, data.conversationId)
      break
    default:
      throw new UnrecoverableError(`unknown channel_type: ${String(context.channel_type)}`)
  }
  await dispatchPushes(allCreated)
}
