import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { closeAndUnregisterGlideMQInstance, createQueue } from '@data-stores/valkey-glide-mq'
import { removeQueueScheduler } from './remove-queue-scheduler.mts'

describe('removeQueueScheduler', () => {
  it('removes only the named scheduler and is idempotent', async () => {
    const queueName = `remove-scheduler-${randomUUID()}`
    const schedulerId = `retired-${randomUUID()}`
    const setupQueue = createQueue(queueName)
    await setupQueue.upsertJobScheduler(
      schedulerId,
      { every: 60_000 },
      { name: 'retired-job', data: {} },
    )
    await closeAndUnregisterGlideMQInstance(setupQueue)

    try {
      await expect(removeQueueScheduler(queueName, schedulerId)).resolves.toEqual({
        before: [schedulerId],
        after: [],
        removed: true,
      })
      await expect(removeQueueScheduler(queueName, schedulerId)).resolves.toEqual({
        before: [],
        after: [],
        removed: false,
      })
    } finally {
      const cleanupQueue = createQueue(queueName)
      await cleanupQueue.obliterate({ force: true })
      await closeAndUnregisterGlideMQInstance(cleanupQueue)
    }
  })
})
