import { randomUUID } from 'node:crypto'
import { Worker, type Job } from 'glide-mq'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { creationJobOptions } from '@queues/bedrock-embeddings-batch/enqueues'
import { workerQueueConnection, workerQueuePrefix } from '@data-stores/valkey-glide-mq'
import { getBatchCreationLimits } from '@services/bedrock-embeddings-batch/rate-limits'
import {
  minimumImageBatchSizeMB,
  minimumTextBatchSizeMB,
} from '@services/bedrock-embeddings/batch/input-size-limits'
import {
  getRateLimitConfig,
  bedrockEmbeddingsBatchConfig,
} from '@services/bedrock-embeddings/batch/config'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import {
  acquireEmbeddingQuotaFixture,
  emptyEmbeddingCreationDependencies,
} from '@voucha/test-helpers/embedding-creation-quota'
import { createOwnedEmbeddingQueue } from '@voucha/test-helpers/embedding-creation-events'
import { createEmbeddingCreationWorker } from '../workers/bedrock-embeddings-batch-creation.mts'
import { delayEmbeddingCreationJob } from '@queues/bedrock-embeddings-batch/payload/creation-deferral'

vi.mock<typeof import('glide-mq')>(import('glide-mq'), importOriginal => importOriginal())

const connection = { connection: workerQueueConnection, prefix: workerQueuePrefix }

let quota: Awaited<ReturnType<typeof acquireEmbeddingQuotaFixture>>
async function setupQuota() {
  quota = await acquireEmbeddingQuotaFixture()
}

function fixedEmptyCursor() {
  return {
    sweepStartedAt: '2024-01-01T00:00:00.000Z',
    afterId: '00000000-0000-0000-0000-000000000000',
  }
}

describe('same-job embedding continuation', () => {
  beforeEach(setupQuota)
  it('preserves a delayed cursor and coalesces later roots through repeated capacity denials', async () => {
    const owned = createOwnedEmbeddingQueue(quota, 'retry', connection)
    const { queue } = owned
    const cursor = {
      sweepStartedAt: '2024-01-01T00:00:00.000Z',
      afterId: randomUUID(),
      pendingImageIds: [randomUUID()],
    }
    let capacityAvailable = false
    let advanced = false
    const nextCursor = { ...cursor, afterId: randomUUID() }
    const seen: { id: string; data: unknown }[] = []
    const worker = new Worker(
      queue.name,
      async (job: Job) => {
        seen.push({ id: job.id, data: job.data })
        if (!capacityAvailable) await delayEmbeddingCreationJob(job, cursor, 30000)
        else if (!advanced) {
          advanced = true
          await delayEmbeddingCreationJob(job, nextCursor)
        }
      },
      { ...owned.options, concurrency: 1, blockTimeout: 100, promotionInterval: 100 },
    )
    owned.watchWorker(worker)
    await owned.run(async () => {
      await Promise.all([owned.ready(), worker.waitUntilReady()])
      const first = await owned.add('images', {}, creationJobOptions('images_batch'))
      if (!first) throw new Error('Expected initial creation job')
      await owned.waitFor(first.id, 'delay-changed')
      expect(await first.getState()).toBe('delayed')
      expect((await queue.getJob(first.id))?.data).toEqual({ cursor })
      for (let attempt = 0; attempt < 3; attempt++)
        expect(await owned.add('images', {}, creationJobOptions('images_batch'))).toBeNull()
      await owned.track(first.promote())
      await owned.waitFor(first.id, 'delay-changed', 2)
      expect(await first.getState()).toBe('delayed')
      expect(await owned.add('images', {}, creationJobOptions('images_batch'))).toBeNull()
      expect((await queue.getJob(first.id))?.attemptsMade).toBe(0)
      capacityAvailable = true
      await owned.track(first.promote())
      await owned.waitFor(first.id, 'delay-changed', 3)
      const completed = owned.waitFor(first.id, 'completed')
      await owned.promoteContinuation(first, completed)
      await completed
      expect(seen.map(item => item.id)).toEqual([first.id, first.id, first.id, first.id])
      expect(seen.map(item => item.data)).toEqual([
        {},
        { cursor },
        { cursor },
        { cursor: nextCursor },
      ])
      expect(await owned.add('images', {}, creationJobOptions('images_batch'))).not.toBeNull()
    })
  })

  it.each(['topics', 'posts', 'rss_feed_items', 'crawl_chunks', 'images'])(
    'parks production %s on the original job when provider capacity is full',
    async type => {
      const owned = createOwnedEmbeddingQueue(quota, 'routes', connection)
      const otherWork = await quota.insertOtherWork(1)
      const countLimit = otherWork.after.count + 1
      expect(countLimit).toBeLessThanOrEqual(getRateLimitConfig().MAX_INFLIGHT_JOBS)
      const restore = overrideDynamicConfigFieldsForTest(bedrockEmbeddingsBatchConfig, {
        max_inflight_jobs: countLimit,
        creation_retry_delay_ms: 30000,
      })
      quota.beforeRelease(async () => restore())
      expect(await getBatchCreationLimits()).toMatchObject({ allowed: true })
      const contribution = await quota.insertCountReservation()
      expect(contribution.before).toEqual(otherWork.after)
      expect(contribution.after.count - contribution.before.count).toBe(1)
      expect(await getBatchCreationLimits()).toEqual({
        allowed: false,
        reason: 'inflight_job_limit_exceeded',
      })
      const cursor = { sweepStartedAt: '2024-01-01T00:00:00.000Z', afterId: randomUUID() }
      const seen = new Set<string>()
      await owned.run(async () => {
        await owned.ready()
        const worker = await createEmbeddingCreationWorker(owned.queue, {
          blockTimeout: 100,
          promotionInterval: 100,
        })
        owned.watchWorker(worker)
        worker.on('active', active => seen.add(active.name))
        await worker.waitUntilReady()
        const job = await owned.add(type, { cursor }, creationJobOptions(type))
        if (!job) throw new Error('Expected creation route job')
        await owned.waitFor(job.id, 'delay-changed')
        expect(await job.getState()).toBe('delayed')
        expect((await owned.queue.getJob(job.id))?.data).toEqual({ cursor })
        expect(await owned.add(type, {}, creationJobOptions(type))).toBeNull()
        expect([...seen]).toEqual([type])
      })
      expect(await quota.removeOwnedReservations()).toEqual({
        verifiedAbsentCount: 2,
        remainingCount: 0,
      })
    },
  )

  it.each(['topics', 'posts', 'rss_feed_items', 'crawl_chunks', 'images', 'unknown'])(
    'drains an empty fixed %s sweep or rejects an unknown creation type',
    async type => {
      // Controlled admission isolates empty routing; SQL, SDK workers and submission remain real.
      const owned = createOwnedEmbeddingQueue(quota, 'empty', connection)
      await owned.run(async () => {
        await owned.ready()
        const job = await owned.add(type, { cursor: fixedEmptyCursor() }, creationJobOptions(type))
        if (!job) throw new Error('Expected empty creation sweep job')
        const worker = await createEmbeddingCreationWorker(
          owned.queue,
          { blockTimeout: 100, promotionInterval: 100 },
          emptyEmbeddingCreationDependencies,
        )
        owned.watchWorker(worker)
        await worker.waitUntilReady()
        await owned.waitFor(job.id, type === 'unknown' ? 'failed' : 'completed')
        expect(await job.getState()).toBe(type === 'unknown' ? 'failed' : 'completed')
        expect(await owned.queue.getJob(job.id)).toMatchObject(
          type === 'unknown'
            ? { failedReason: 'Unknown creation job type: unknown' }
            : { returnvalue: { empty: true, hasMore: false } },
        )
      })
    },
  )

  it('yields an image capacity delay to text work while preserving the global creation cap', async () => {
    const owned = createOwnedEmbeddingQueue(quota, 'mixed', connection)
    const restore = overrideDynamicConfigFieldsForTest(bedrockEmbeddingsBatchConfig, {
      creation_retry_delay_ms: 30000,
    })
    quota.beforeRelease(async () => restore())
    const config = getRateLimitConfig()
    const baseline = await requireAdmitted(true)
    const foreign = await quota.insertOtherWork(1)
    expect(foreign.after.count - foreign.before.count).toBe(1)
    expect(foreign.after.inputSizeMB - foreign.before.inputSizeMB).toBeCloseTo(1, 6)
    const usage = await quota.readGlobalUsage()
    if (usage.count + 1 >= config.MAX_INFLIGHT_JOBS)
      throw new Error('Global quota precondition: no count slot for the owned reservation')
    const imageMinimum = minimumImageBatchSizeMB(baseline.minRecords)
    const textMinimum = minimumTextBatchSizeMB(baseline.minRecords)
    const remainingMB = (imageMinimum + textMinimum) / 2
    const reservation = await quota.insertFairnessReservation(
      config.MAX_INFLIGHT_SIZE_MB,
      remainingMB,
    )
    const reserved = await getBatchCreationLimits()
    if (!reserved.allowed) throw new Error(`Global accounting changed: ${reserved.reason}`)
    expect(reserved.maxRecords).toBeGreaterThanOrEqual(reserved.minRecords)
    expect(reserved.maxSizeMB).toBeCloseTo(remainingMB, 6)
    expect(reserved.maxSizeMB).toBeGreaterThanOrEqual(textMinimum)
    expect(reserved.maxSizeMB).toBeLessThan(imageMinimum)
    expect(reservation.reservationMB).toBeGreaterThanOrEqual(0)
    const setConcurrency = vi.spyOn(owned.queue, 'setGlobalConcurrency')
    quota.beforeRelease(async () => {
      setConcurrency.mockRestore()
    })
    await owned.run(async () => {
      await owned.ready()
      for (let index = 0; index < 2; index++) {
        const worker = await createEmbeddingCreationWorker(owned.queue, {
          blockTimeout: 100,
          promotionInterval: 100,
        })
        owned.watchWorker(worker)
      }
      await Promise.all(owned.workers.map(worker => worker.waitUntilReady()))
      expect(setConcurrency).toHaveBeenCalledTimes(2)
      expect(setConcurrency).toHaveBeenCalledWith(1)
      const cursor = fixedEmptyCursor()
      const image = await owned.add('images', { cursor }, creationJobOptions('mixed_images'))
      if (!image) throw new Error('Expected image chain')
      await owned.waitFor(image.id, 'delay-changed')
      expect(await image.getState()).toBe('delayed')
      const text = await owned.add('topics', { cursor }, creationJobOptions('mixed_topics'))
      if (!text) throw new Error('Expected text job')
      await owned.waitFor(text.id, 'completed')
      expect(await text.getState()).toBe('completed')
      expect((await owned.queue.getJob(text.id))?.returnvalue).toMatchObject({ empty: true })
      expect(await image.getState()).toBe('delayed')
      expect((await owned.queue.getJob(image.id))?.data).toEqual({ cursor })
      expect(await owned.add('images', {}, creationJobOptions('mixed_images'))).toBeNull()
    })
    expect(await quota.removeOwnedReservations()).toEqual({
      verifiedAbsentCount: 2,
      remainingCount: 0,
    })
  })
})

describe('creation queue global concurrency', () => {
  beforeEach(setupQuota)
  it('serializes creation jobs across workers without retaining a delayed ordering lane', async () => {
    const owned = createOwnedEmbeddingQueue(quota, 'global', connection)
    const { queue } = owned
    await queue.setGlobalConcurrency(1)
    const firstStarted = Promise.withResolvers<void>()
    const releaseFirst = Promise.withResolvers<void>()
    const bothDone = Promise.withResolvers<void>()
    owned.releaseOnCleanup(() => releaseFirst.resolve())
    let active = 0
    let maxActive = 0
    let completed = 0
    const processor = async (_job: Job) => {
      active++
      maxActive = Math.max(maxActive, active)
      if (completed === 0) {
        firstStarted.resolve()
        await releaseFirst.promise
      }
      active--
      completed++
      if (completed === 2) bothDone.resolve()
    }
    await owned.run(async () => {
      await owned.ready()
      await owned.add('images', {}, creationJobOptions('images'))
      await owned.add('topics', {}, creationJobOptions('topics'))
      for (let index = 0; index < 2; index++)
        owned.watchWorker(
          new Worker(queue.name, processor, {
            ...owned.options,
            concurrency: 2,
            blockTimeout: 100,
            promotionInterval: 100,
          }),
        )
      await Promise.all(owned.workers.map(worker => worker.waitUntilReady()))
      await firstStarted.promise
      expect((await queue.getJobCounts()).active).toBe(1)
      expect(active).toBe(1)
      releaseFirst.resolve()
      await bothDone.promise
      expect(maxActive).toBe(1)
    })
  })
})

async function requireAdmitted(images: boolean) {
  const limits = await getBatchCreationLimits()
  if (!limits.allowed) throw new Error(`Global quota precondition: ${limits.reason}`)
  const requiredMB = images
    ? minimumImageBatchSizeMB(limits.minRecords)
    : minimumTextBatchSizeMB(limits.minRecords)
  if (limits.maxRecords < limits.minRecords || limits.maxSizeMB < requiredMB)
    throw new Error('Global quota precondition: insufficient minimum batch capacity')
  return limits
}
