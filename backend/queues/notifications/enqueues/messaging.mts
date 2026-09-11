import { createEnqueueFunction } from '@data-stores/valkey-glide-mq'
import type { EnqueueReturnType } from '@voucha/types'
import type { JobOptions } from 'glide-mq'
import { NOTIFICATIONS_DEDUPLICATION_TTL_MS, PRIORITY_DEFAULT, QUEUE_NAME } from '../config.mts'
import { notifications } from '../queues.mts'

type ConversationMessageNotificationData = {
  conversationId: string
  messageId: string
  senderId: string
}

const enqueueConversationMessageNotificationJob = createEnqueueFunction<
  ConversationMessageNotificationData,
  'processConversationMessageNotification'
>({
  queue: notifications,
  queueName: QUEUE_NAME,
  jobName: 'processConversationMessageNotification',
})

export function enqueueConversationMessageNotification(
  conversationId: string,
  messageId: string,
  senderId: string,
): EnqueueReturnType {
  return enqueueConversationMessageNotificationJob({ conversationId, messageId, senderId }, {
    priority: PRIORITY_DEFAULT,
    deduplication: {
      id: `processConversationMessageNotification__${conversationId}__${messageId}`,
      mode: 'debounce',
      ttl: NOTIFICATIONS_DEDUPLICATION_TTL_MS,
    },
  } satisfies Partial<JobOptions>)
}
