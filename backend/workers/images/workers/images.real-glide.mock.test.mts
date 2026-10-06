import { randomUUID } from 'node:crypto'
import { Queue, type Job, type Worker } from 'glide-mq'
import { describe, expect, it, vi } from 'vitest'
import { workerQueueConnection } from '@data-stores/valkey-glide-mq'
import { IMAGES_QUEUE_NAME } from '@queues/images/config'
import { createImagesWorker } from '../processors/create-images-worker.mts'

// Keep the native worker/queue boundary while constraining this dispatch test to its own queue prefix.
vi.mock<typeof import('glide-mq')>(import('glide-mq'), async importOriginal => importOriginal())

describe('images worker', () => {
  it('dispatches abandoned-upload cleanup and returns its result', async () => {
    const prefix = `test-images-${randomUUID()}`
    const queue = new Queue(IMAGES_QUEUE_NAME, { connection: workerQueueConnection, prefix })
    const cleanupResult = { cleaned: 2, recovered: 1, stagedSourcesDeleted: 3 }
    const cleanupAbandonedUploads = vi.fn<() => Promise<typeof cleanupResult>>()
    cleanupAbandonedUploads.mockResolvedValue(cleanupResult)
    let worker: Worker | undefined
    let onFailed: ((job: Job, error: Error) => void) | undefined
    let onCompleted: ((job: Job, result: unknown) => void) | undefined

    try {
      worker = createImagesWorker({ prefix, cleanupAbandonedUploads })
      await worker.waitUntilReady()
      const failed = Promise.withResolvers<{ job: Job; error: Error }>()
      const completed = Promise.withResolvers<{ job: Job; result: unknown }>()
      onFailed = (failedJob, error) => failed.resolve({ job: failedJob, error })
      onCompleted = (completedJob, result) => completed.resolve({ job: completedJob, result })
      worker.on('failed', onFailed)
      worker.on('completed', onCompleted)

      const job = await queue.add('cleanup-abandoned-uploads', {}, { attempts: 1 })
      if (!job) throw new Error('Expected abandoned-upload cleanup job')
      const outcome = await Promise.race([
        completed.promise.then(value => ({ status: 'completed' as const, ...value })),
        failed.promise.then(value => ({ status: 'failed' as const, ...value })),
      ])

      expect(outcome.status).toBe('completed')
      if (outcome.status !== 'completed') throw outcome.error
      expect(outcome.job.id).toBe(job.id)
      expect(outcome.result).toEqual(cleanupResult)
      const completedJob = await queue.getJob(job.id)
      expect(completedJob?.returnvalue).toEqual(cleanupResult)
      expect(cleanupAbandonedUploads).toHaveBeenCalledOnce()
    } finally {
      if (worker && onFailed) worker.off('failed', onFailed)
      if (worker && onCompleted) worker.off('completed', onCompleted)
      try {
        await worker?.close()
      } finally {
        try {
          await queue.obliterate({ force: true })
        } finally {
          await queue.close()
        }
      }
    }
  })
})
