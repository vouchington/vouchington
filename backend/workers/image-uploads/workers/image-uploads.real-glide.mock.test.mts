import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { Readable } from 'node:stream'
import { Queue, Worker, type Job } from 'glide-mq'
import sharp from 'sharp'
import { describe, expect, it, vi } from 'vitest'
import { workerQueueConnection } from '@data-stores/valkey-core/glide-mq-client'
import { imageStatePubSub } from '@data-stores/valkey-pubsub'
import { BACKGROUND_CPU_QUEUE_NAME as CONTENT_ANALYSIS_QUEUE_NAME } from '@queues/background-cpu/config'
import { IMAGE_UPLOADS_QUEUE_NAME } from '@queues/image-uploads/config'
import { createTestUser, insertTestImage } from '@voucha/test-helpers'
import {
  insertPendingTestImage,
  setImageHashAndProcessing,
} from '@voucha/test-helpers/entities/images'
import { enableStaydownMatchingForTest } from '@voucha/test-helpers/services/copyright-notices/staydown-matching'
import { createImageUploadsWorker } from '../processors/create-image-uploads-worker.mts'

// Use native GlideMQ for both queues and the worker in this regression.
vi.mock<typeof import('glide-mq')>(import('glide-mq'), async importOriginal => importOriginal())

describe('image upload worker', () => {
  // Native GlideMQ, PostgreSQL, and pubsub participate in this lifecycle, including graceful
  // worker startup and cleanup; allow this integration case up to 15 seconds under load.
  it('publishes completion while all content-analysis slots are busy and work remains pending', async () => {
    const prefix = `image-uploads-${randomUUID()}`
    const uploads = new Queue(IMAGE_UPLOADS_QUEUE_NAME, {
      connection: workerQueueConnection,
      prefix,
    })
    const analysis = new Queue(CONTENT_ANALYSIS_QUEUE_NAME, {
      connection: workerQueueConnection,
      prefix,
    })
    const user = await createTestUser()
    const imageId = await insertPendingTestImage(user.id)
    const jpeg = await sharp(randomBytes(8 * 8 * 3), {
      raw: { width: 8, height: 8, channels: 3 },
    })
      .jpeg()
      .toBuffer()
    const sha256 = createHash('sha256').update(jpeg).digest()
    await setImageHashAndProcessing(imageId, sha256)
    const staydownImageId = await insertTestImage(user.id)
    const restoreStaydown = await enableStaydownMatchingForTest()
    const subscription = await imageStatePubSub.subscribe(imageId)
    const published = Promise.withResolvers<{ upload_status: string; id: string }>()
    subscription.setHandler(state => published.resolve(state))
    const concurrency = 1
    const allStarted = Promise.withResolvers<void>()
    const releaseAnalysis = Promise.withResolvers<void>()
    let started = 0
    let uploadWorker: Worker | undefined
    let analysisWorker: Worker | undefined
    try {
      analysisWorker = new Worker(
        CONTENT_ANALYSIS_QUEUE_NAME,
        async () => {
          started += 1
          if (started === concurrency) allStarted.resolve()
          await releaseAnalysis.promise
          return { success: true }
        },
        { connection: workerQueueConnection, prefix, concurrency, blockTimeout: 100 },
      )
      await analysisWorker.waitUntilReady()
      await analysis.addBulk(
        Array.from({ length: concurrency + 1 }, () => ({
          name: 'content-analysis.staydown-hash',
          data: { id: staydownImageId },
          opts: { priority: 10 },
        })),
      )
      await allStarted.promise
      expect(started).toBe(concurrency)
      expect(await analysis.getJobs('active')).toHaveLength(concurrency)
      expect(
        (await analysis.getJobs('waiting')).length + (await analysis.getJobs('delayed')).length,
      ).toBe(1)

      uploadWorker = createImageUploadsWorker(
        prefix,
        {
          getImageFromS3: async () => ({
            $metadata: {},
            Body: Readable.from([jpeg]) as never,
          }),
        },
        { blockTimeout: 100 },
      )
      await uploadWorker.waitUntilReady()
      const completed = Promise.withResolvers<{ job: Job; result: unknown }>()
      const failed = Promise.withResolvers<Error>()
      uploadWorker.on('completed', (job, result) => completed.resolve({ job, result }))
      uploadWorker.on('failed', (_job, error) => failed.resolve(error))
      const upload = await uploads.add('extract-metadata', { id: imageId }, { attempts: 1 })
      if (!upload) throw new Error('Expected metadata job')
      const outcome = await Promise.race([
        completed.promise.then(value => ({ status: 'completed' as const, ...value })),
        failed.promise.then(error => ({ status: 'failed' as const, error })),
      ])
      if (outcome.status === 'failed') throw outcome.error
      expect(outcome.job.id).toBe(upload.id)
      expect(outcome.result).toEqual({ success: true })
      await expect(published.promise).resolves.toMatchObject({
        id: imageId,
        upload_status: 'complete',
      })
      expect(started).toBe(concurrency)
      expect(await analysis.getJobs('active')).toHaveLength(concurrency)
      expect(
        (await analysis.getJobs('waiting')).length + (await analysis.getJobs('delayed')).length,
      ).toBe(1)
    } finally {
      releaseAnalysis.resolve()
      await subscription.close()
      await uploadWorker?.close()
      await analysisWorker?.close()
      await uploads.obliterate({ force: true })
      await uploads.close()
      await analysis.obliterate({ force: true })
      await analysis.close()
      restoreStaydown()
    }
  }, 15_000)
})
