import { enqueueConversationMessageNotification } from '@queues/notifications/enqueues/messaging'

export async function processConversationMessageCreated(data: {
  conversationId: string
  messageId: string
  senderId: string
}) {
  return await enqueueConversationMessageNotification(
    data.conversationId,
    data.messageId,
    data.senderId,
  )
}
