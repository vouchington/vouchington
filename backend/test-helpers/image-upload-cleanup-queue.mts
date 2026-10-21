import { randomUUID } from 'node:crypto'
import { createQueue, closeAndUnregisterGlideMQInstance } from '@data-stores/valkey-glide-mq'
import { IMAGE_UPLOADS_QUEUE_NAME } from '@queues/image-uploads/config'

/** A real destination with identical priority/admission contracts and no foreign backlog. */
export function createOwnedUploadRecoveryQueue() {
  const queue = createQueue(`${IMAGE_UPLOADS_QUEUE_NAME}-${randomUUID()}`, {
    priorityKind: 'none',
  })
  let closing: Promise<void> | undefined
  return {
    queue,
    close: () =>
      (closing ??= (async () => {
        try {
          await queue.obliterate({ force: true })
        } finally {
          await closeAndUnregisterGlideMQInstance(queue)
        }
      })()),
  }
}
