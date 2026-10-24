import {
  closeAndUnregisterGlideMQInstance,
  createMaintenanceQueue,
} from '@data-stores/valkey-glide-mq'
import { removeScheduledJobScheduler } from '@vouchington/worker-runtime/schedule-manifest'

/**
 * @public Retained provisionally under issue #1360; external production use is unconfirmed and this
 * export may be made private or removed after intended-use review. Evidence: `docs/overview/architecture/services/README.md`.
 */
export async function removeQueueScheduler(queueName: string, schedulerId: string) {
  const queue = createMaintenanceQueue(queueName)
  try {
    return await removeScheduledJobScheduler(queue, schedulerId)
  } finally {
    await closeAndUnregisterGlideMQInstance(queue)
  }
}
