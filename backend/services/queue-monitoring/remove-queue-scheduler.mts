import { closeAndUnregisterGlideMQInstance, createQueue } from '@data-stores/valkey-glide-mq'
import { removeScheduledJobScheduler } from '@modules/scheduled-job-manifest'

/**
 * @public Retained provisionally under issue #1360; external production use is unconfirmed and this
 * export may be made private or removed after intended-use review. Evidence: `docs/overview/architecture/services/queue-monitoring/README.md`.
 */
export async function removeQueueScheduler(queueName: string, schedulerId: string) {
  const queue = createQueue(queueName)
  try {
    return await removeScheduledJobScheduler(queue, schedulerId)
  } finally {
    await closeAndUnregisterGlideMQInstance(queue)
  }
}
