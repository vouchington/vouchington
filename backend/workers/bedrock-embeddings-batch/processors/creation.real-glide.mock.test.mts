import { randomUUID } from 'node:crypto'
import { Worker, type Job } from 'glide-mq'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { creationJobOptions } from '@queues/bedrock-embeddings-batch/enqueues'
import { delayEmbeddingCreationJob } from '@queues/bedrock-embeddings-batch/payload/creation-deferral'
import { workerQueueConnection, workerQueuePrefix } from '@data-stores/valkey-glide-mq'
import {
  getRateLimitConfig,
  bedrockEmbeddingsBatchConfig,
} from '@services/bedrock-embeddings/batch/config'
import type { BatchJobType } from '@services/bedrock-embeddings/batch/types'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { acquireEmbeddingQuotaFixture } from '@voucha/test-helpers/embedding-creation-quota'
import { createOwnedEmbeddingQueue } from '@voucha/test-helpers/embedding-creation-events'
import { createEmbeddingCountSnapshot } from '@voucha/test-helpers/embedding-creation-count-snapshot'
import { processEmbeddingCreationJob } from './creation.mts'

vi.mock<typeof import('glide-mq')>(import('glide-mq'), importOriginal => importOriginal())

const connection = { connection: workerQueueConnection, prefix: workerQueuePrefix }
const creationTypes = ['topics', 'posts', 'rss_feed_items', 'crawl_chunks', 'images'] as const

let quota: Awaited<ReturnType<typeof acquireEmbeddingQuotaFixture>>

describe('native embedding creation admission', () => {
  beforeEach(async () => {
    quota = await acquireEmbeddingQuotaFixture()
  }, 25_000)

  it('retains one job and cursor through repeated capacity delays and a continuation', async () => {
    const owned = createOwnedEmbeddingQueue(quota, 'continuation', connection)
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

  it.each(creationTypes)(
    'delays production %s on its original job when actual provider quota is full',
    async (type: BatchJobType) => {
      const owned = createOwnedEmbeddingQueue(quota, `admission_${type}`, connection)
      const snapshot = await createEmbeddingCountSnapshot(quota)
      const countLimit = snapshot.before.count + 1
      expect(countLimit).toBeLessThanOrEqual(getRateLimitConfig().MAX_INFLIGHT_JOBS)
      const restore = overrideDynamicConfigFieldsForTest(bedrockEmbeddingsBatchConfig, {
        max_inflight_jobs: countLimit,
        creation_retry_delay_ms: 30_000,
      })
      quota.beforeRelease(async () => restore())
      expect(await snapshot.limits()).toMatchObject({ allowed: true })
      await snapshot.insertReservation()
      expect(await snapshot.limits()).toEqual({
        allowed: false,
        reason: 'inflight_job_limit_exceeded',
      })

      const cursor = { sweepStartedAt: '2024-01-01T00:00:00.000Z', afterId: randomUUID() }
      const name = `bedrock-embeddings.create_${type}`
      const activated: string[] = []
      await owned.run(async () => {
        await owned.ready()
        const worker = await owned.createWorker(
          () =>
            new Worker(
              owned.queue.name,
              (job: Job) => processEmbeddingCreationJob(job, type, snapshot.dependencies),
              { ...owned.options, concurrency: 1, blockTimeout: 1_000, promotionInterval: 2_500 },
            ),
        )
        worker.on('active', job => activated.push(job.name))
        await worker.waitUntilReady()
        const job = await owned.add(name, { cursor }, creationJobOptions(type))
        if (!job) throw new Error('Expected creation route job')
        await owned.waitFor(job.id, 'delay-changed')
        const stored = await owned.queue.getJob(job.id)
        expect(await stored?.getState()).toBe('delayed')
        expect(stored?.id).toBe(job.id)
        expect(stored?.data).toEqual({ cursor })
        expect(stored?.attemptsMade).toBe(0)
        expect(await owned.add(name, {}, creationJobOptions(type))).toBeNull()
        expect(activated).toEqual([name])
      })
      expect(await snapshot.removeOwnedReservations()).toEqual({
        verifiedAbsentCount: 1,
        remainingCount: 0,
      })
      expect(await snapshot.limits()).toMatchObject({ allowed: true })
    },
  )
})
