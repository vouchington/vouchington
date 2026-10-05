import { runIsolatedDatabaseCase } from '../../../../test-helpers/vitest-isolated-database-case.mts'
import { getIsolatedDatabaseCaseMode } from '../../../../test-helpers/vitest-isolated-database-cases.mts'
import { Queue, type Worker } from 'glide-mq'
import { describe, expect, it, vi } from 'vitest'

// Keep the native worker/queue boundary in both this project and its isolated child.
vi.mock<typeof import('glide-mq')>(import('glide-mq'), async importOriginal => importOriginal())

describe('images worker', () => {
  it('cleans abandoned uploads from the worker job', async ({ onTestFinished }) => {
    if (getIsolatedDatabaseCaseMode('images-abandoned-upload-cleanup') === 'parent') {
      await runIsolatedDatabaseCase('images-abandoned-upload-cleanup')
      return
    }

    let worker: Worker | undefined
    let queue: Queue | undefined

    onTestFinished(async () => {
      try {
        await worker?.close()
      } finally {
        if (queue) {
          try {
            await queue.obliterate({ force: true })
          } finally {
            await queue.close()
          }
        }
      }
    }, 240_000)

    // Only the child may instantiate the default worker: its global sweep owns a fresh DB.
    const { images } = await import('./images.mts')
    worker = images
    const { workerQueueConnection, workerQueuePrefix } =
      await import('@data-stores/valkey-glide-mq')
    const { IMAGES_QUEUE_NAME } = await import('@queues/images/config')
    queue = new Queue(IMAGES_QUEUE_NAME, {
      connection: workerQueueConnection,
      prefix: workerQueuePrefix,
    })
    await worker.waitUntilReady()
    const job = await queue.add('cleanup-abandoned-uploads', {}, { attempts: 1 })
    if (!job) throw new Error('Expected abandoned-upload cleanup job')

    await vi.waitFor(async () => expect(await job.getState()).toBe('completed'), {
      timeout: 240_000,
    })
    const completedJob = await queue.getJob(job.id)
    expect(completedJob?.returnvalue).toEqual({
      cleaned: expect.any(Number),
      recovered: expect.any(Number),
      stagedSourcesDeleted: expect.any(Number),
    })
  }, 240_000)
})
