import { randomUUID } from 'node:crypto'
import { Queue, type Job, type Worker } from 'glide-mq'
import { describe, expect, it, vi } from 'vitest'
import { workerQueueConnection } from '@data-stores/valkey-glide-mq'
import { IMAGES_QUEUE_NAME } from '@queues/images/config'
import { enableStaydownMatchingForTest } from '@voucha/test-helpers/services/copyright-notices/staydown-matching'
import { createImagesWorker } from '../processors/create-images-worker.mts'

// Keep the native worker/queue boundary while constraining this dispatch test to its own queue prefix.
vi.mock<typeof import('glide-mq')>(import('glide-mq'), async importOriginal => importOriginal())

describe('images worker', () => {
  it('replays metadata and staydown jobs for missing images and persists unknown-job failure', async () => {
    const prefix = `test-images-replay-${randomUUID()}`
    const queue = new Queue(IMAGES_QUEUE_NAME, { connection: workerQueueConnection, prefix })
    const completedNames = ['extract-metadata', 'staydown-hash'] as const
    const completed = new Map(
      completedNames.map(name => [name, Promise.withResolvers<{ job: Job; result: unknown }>()]),
    )
    const failed = Promise.withResolvers<{ job: Job; error: Error }>()
    let worker: Worker | undefined
    let onFailed: ((job: Job, error: Error) => void) | undefined
    let onCompleted: ((job: Job, result: unknown) => void) | undefined
    let restoreStaydownMatching: (() => void) | undefined

    try {
      restoreStaydownMatching = await enableStaydownMatchingForTest()
      worker = createImagesWorker({ prefix })
      await worker.waitUntilReady()
      onFailed = (failedJob, error) => failed.resolve({ job: failedJob, error })
      onCompleted = (completedJob, result) => {
        if (completedJob.name !== 'extract-metadata' && completedJob.name !== 'staydown-hash')
          return
        completed.get(completedJob.name)!.resolve({ job: completedJob, result })
      }
      worker.on('failed', onFailed)
      worker.on('completed', onCompleted)

      for (const name of completedNames) {
        const job = await queue.add(name, { id: randomUUID() }, { attempts: 1 })
        if (!job) throw new Error(`Expected ${name} replay job`)
        const outcome = await Promise.race([
          completed.get(name)!.promise.then(value => ({ status: 'completed' as const, ...value })),
          failed.promise.then(value => ({ status: 'failed' as const, ...value })),
        ])
        if (outcome.status === 'failed') throw outcome.error
        expect(outcome.job.id).toBe(job.id)
        expect(outcome.result).toEqual({ success: true })
        const completedJob = await queue.getJob(job.id)
        expect(completedJob?.returnvalue).toEqual({ success: true })
      }

      const unknown = await queue.add('unknown-test-job', {}, { attempts: 1, removeOnFail: false })
      if (!unknown) throw new Error('Expected unknown images job')
      const failure = await failed.promise
      expect(failure.job.id).toBe(unknown.id)
      expect(failure.error).toEqual(new Error('Unknown job name: unknown-test-job'))
      const failedJob = await queue.getJob(unknown.id)
      expect(failedJob?.failedReason).toBe('Unknown job name: unknown-test-job')
    } finally {
      if (worker && onFailed) worker.off('failed', onFailed)
      if (worker && onCompleted) worker.off('completed', onCompleted)
      try {
        await worker?.close()
      } finally {
        try {
          await queue.obliterate({ force: true })
        } finally {
          try {
            await queue.close()
          } finally {
            restoreStaydownMatching?.()
          }
        }
      }
    }
  })

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
