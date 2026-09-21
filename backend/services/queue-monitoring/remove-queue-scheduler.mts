import { closeAndUnregisterGlideMQInstance, createQueue } from '@data-stores/valkey-glide-mq'
import { removeScheduledJobScheduler } from '@modules/scheduled-job-manifest'

export async function removeQueueScheduler(queueName: string, schedulerId: string) {
  const queue = createQueue(queueName)
  try {
    return await removeScheduledJobScheduler(queue, schedulerId)
  } finally {
    await closeAndUnregisterGlideMQInstance(queue)
  }
}
