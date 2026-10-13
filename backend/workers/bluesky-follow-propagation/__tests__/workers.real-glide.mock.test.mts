import { randomUUID } from 'node:crypto'
import { Queue } from 'glide-mq'
import { describe, expect, it, vi } from 'vitest'
import { workerQueueConnection, workerQueuePrefix } from '@data-stores/valkey-glide-mq'
import { createBlueskyFollowPropagationWorker } from '../workers.mts'

vi.mock<typeof import('glide-mq')>(import('glide-mq'), async importOriginal => importOriginal())

describe('bluesky follow propagation worker', () => {
  it('caps the queue at one active job across replicas before the worker starts', async () => {
    const queue = new Queue(`bluesky_follow_propagation_${randomUUID()}`, {
      connection: workerQueueConnection,
      prefix: workerQueuePrefix,
    })
    const setGlobalConcurrency = vi.spyOn(queue, 'setGlobalConcurrency')
    let worker: Awaited<ReturnType<typeof createBlueskyFollowPropagationWorker>> | undefined

    try {
      worker = await createBlueskyFollowPropagationWorker(queue)
      await worker.waitUntilReady()

      expect(setGlobalConcurrency).toHaveBeenCalledExactlyOnceWith(1)
      expect(worker.name).toBe(queue.name)
    } finally {
      await worker?.close(true)
      await queue.obliterate({ force: true })
      await queue.close()
    }
  })
})
