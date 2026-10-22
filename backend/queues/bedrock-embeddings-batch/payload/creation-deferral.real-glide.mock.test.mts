import { randomUUID } from 'node:crypto'
import { Worker, type Job } from 'glide-mq'
import { describe, expect, it, vi } from 'vitest'
import { creationJobOptions } from '@queues/bedrock-embeddings-batch/enqueues'
import { delayEmbeddingCreationJob } from '@queues/bedrock-embeddings-batch/payload/creation-deferral'
import { workerQueueConnection, workerQueuePrefix } from '@data-stores/valkey-glide-mq'
import { createOwnedEmbeddingQueueWithoutQuota } from '@voucha/test-helpers/embedding-creation-events'

vi.mock<typeof import('glide-mq')>(import('glide-mq'), importOriginal => importOriginal())

describe('native embedding creation replay', () => {
  it('retains one job and cursor through repeated capacity delays and a continuation', async () => {
    const owned = createOwnedEmbeddingQueueWithoutQuota('continuation', {
      connection: workerQueueConnection,
      prefix: workerQueuePrefix,
    })
    const cursor = {
      sweepStartedAt: '2024-01-01T00:00:00.000Z',
      afterId: randomUUID(),
      pendingImageIds: [randomUUID()],
    }
    const nextCursor = { ...cursor, afterId: randomUUID() }
    const seen: Array<{ id: string; data: unknown }> = []
    let capacityAvailable = false
    let advanced = false

    await owned.run(async () => {
      await owned.ready()
      const worker = await owned.createWorker(
        () =>
          new Worker(
            owned.queue.name,
            async (job: Job) => {
              seen.push({ id: job.id, data: job.data })
              if (!capacityAvailable) await delayEmbeddingCreationJob(job, cursor, 30_000)
              else if (!advanced) {
                advanced = true
                await delayEmbeddingCreationJob(job, nextCursor)
              }
            },
            { ...owned.options, concurrency: 1, blockTimeout: 1_000, promotionInterval: 2_500 },
          ),
      )
      await worker.waitUntilReady()
      const first = await owned.add(
        'bedrock-embeddings.create_images',
        {},
        creationJobOptions('images_batch'),
      )
      if (!first) throw new Error('Expected initial creation job')

      await owned.waitFor(first.id, 'delay-changed')
      expect(await first.getState()).toBe('delayed')
      expect((await owned.queue.getJob(first.id))?.data).toEqual({ cursor })
      for (let index = 0; index < 3; index++)
        expect(await owned.add(first.name, {}, creationJobOptions('images_batch'))).toBeNull()

      await owned.promote(first)
      await owned.waitFor(first.id, 'delay-changed', 2)
      expect((await owned.queue.getJob(first.id))?.data).toEqual({ cursor })
      expect(await owned.add(first.name, {}, creationJobOptions('images_batch'))).toBeNull()
      expect((await owned.queue.getJob(first.id))?.attemptsMade).toBe(0)

      capacityAvailable = true
      await owned.promote(first)
      await owned.waitFor(first.id, 'delay-changed', 3)
      const completed = owned.waitFor(first.id, 'completed')
      await owned.promoteContinuation(first, completed)
      await completed
      expect(seen).toEqual([
        { id: first.id, data: {} },
        { id: first.id, data: { cursor } },
        { id: first.id, data: { cursor } },
        { id: first.id, data: { cursor: nextCursor } },
      ])
      expect((await owned.queue.getJob(first.id))?.attemptsMade).toBe(0)
      expect(await owned.add(first.name, {}, creationJobOptions('images_batch'))).not.toBeNull()
    })
  })
})
