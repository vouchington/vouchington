import { createBackgroundEnqueue } from '@queues/background/enqueues'
import { NOTIFICATIONS_CONVERSATION_MESSAGE_JOB } from '@queues/background/enqueues/notifications-jobs'
import type { EnqueueReturnType } from '@voucha/types'
import type { JobOptions } from 'glide-mq'
import { NOTIFICATIONS_DEDUPLICATION_TTL_MS } from '../config.mts'

const enqueueConversationMessageNotificationJob = createBackgroundEnqueue(
  NOTIFICATIONS_CONVERSATION_MESSAGE_JOB,
)

export function enqueueConversationMessageNotification(
  conversationId: string,
  messageId: string,
  senderId: string,
): EnqueueReturnType {
  return enqueueConversationMessageNotificationJob({ conversationId, messageId, senderId }, {
    deduplication: {
      id: `processConversationMessageNotification__${conversationId}__${messageId}`,
      mode: 'debounce',
      ttl: NOTIFICATIONS_DEDUPLICATION_TTL_MS,
    },
  } satisfies Partial<JobOptions>)
}
