import { createEnqueueFunction } from '@data-stores/valkey-glide-mq'
import type { EnqueueReturnType } from '@voucha/types'
import type { JobOptions } from 'glide-mq'
import { CUSTOMER_SUPPORT_QUEUE_NAME, PRIORITY_DEFAULT } from './config.mts'
import { customer_support } from './queues.mts'

const enqueueEmbedSupportMessageJob = createEnqueueFunction<
  {
    threadId: string
    messageId: string
  },
  'embedSupportMessage'
>({
  queue: customer_support,
  queueName: CUSTOMER_SUPPORT_QUEUE_NAME,
  jobName: 'embedSupportMessage',
})

export function enqueueEmbedSupportMessage(
  threadId: string,
  messageId: string,
  priority?: number,
  logicalJobId = getEmbedSupportMessageJobId(threadId, messageId),
): EnqueueReturnType {
  return enqueueEmbedSupportMessageJob({ threadId, messageId }, {
    jobId: logicalJobId,
    priority: priority ?? PRIORITY_DEFAULT,
    deduplication: {
      id: logicalJobId,
      mode: 'simple' as const,
    },
  } satisfies Partial<JobOptions>)
}

export function getEmbedSupportMessageJobId(threadId: string, messageId: string): string {
  return `embed_support_message_${threadId}_${messageId}`
}
