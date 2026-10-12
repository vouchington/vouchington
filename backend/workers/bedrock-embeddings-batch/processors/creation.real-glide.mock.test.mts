import { randomUUID } from 'node:crypto'
import { Worker, type Job } from 'glide-mq'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { creationJobOptions } from '@queues/bedrock-embeddings-batch/enqueues'
import { workerQueueConnection, workerQueuePrefix } from '@data-stores/valkey-glide-mq'
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
  createEmptyEmbeddingCreationWorker,
  createEmptyEmbeddingCursor,
} from '@voucha/test-helpers/embedding-creation-empty'
import { acquireEmbeddingQuotaFixture } from '@voucha/test-helpers/embedding-creation-quota'
import { createOwnedEmbeddingQueue } from '@voucha/test-helpers/embedding-creation-events'
import { createEmbeddingCountSnapshot } from '@voucha/test-helpers/embedding-creation-count-snapshot'
import { createEmbeddingFairnessSnapshot } from '@voucha/test-helpers/embedding-creation-fairness'
import { createEmbeddingCreationWorker } from '../workers/bedrock-embeddings-batch-creation.mts'
import { delayEmbeddingCreationJob } from '@queues/bedrock-embeddings-batch/payload/creation-deferral'

vi.mock<typeof import('glide-mq')>(import('glide-mq'), importOriginal => importOriginal())

const connection = { connection: workerQueueConnection, prefix: workerQueuePrefix }

let quota: Awaited<ReturnType<typeof acquireEmbeddingQuotaFixture>>
async function setupQuota() {
  quota = await acquireEmbeddingQuotaFixture()
}

describe('same-job embedding continuation', () => {
  // Lock acquisition may wait for another invocation; each test keeps its five-second budget.
  beforeEach(setupQuota, 25_000)
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
    const worker = await owned.createWorker(
      () =>
        new Worker(
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
        ),
    )
    await owned.run(async () => {
      await Promise.all([owned.ready(), worker.waitUntilReady()])
      const first = await owned.add('images', {}, creationJobOptions('images_batch'))
      if (!first) throw new Error('Expected initial creation job')
      await owned.waitFor(first.id, 'delay-changed')
      expect(await first.getState()).toBe('delayed')
      expect((await queue.getJob(first.id))?.data).toEqual({ cursor })
      for (let attempt = 0; attempt < 3; attempt++)
        expect(await owned.add('images', {}, creationJobOptions('images_batch'))).toBeNull()
      await owned.promote(first)
      await owned.waitFor(first.id, 'delay-changed', 2)
      expect(await first.getState()).toBe('delayed')
      expect(await owned.add('images', {}, creationJobOptions('images_batch'))).toBeNull()
      expect((await queue.getJob(first.id))?.attemptsMade).toBe(0)
      capacityAvailable = true
      await owned.promote(first)
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
      const snapshot = await createEmbeddingCountSnapshot(quota)
      const baseline = snapshot.before
      const countLimit = baseline.count + 1
      expect(countLimit).toBeLessThanOrEqual(getRateLimitConfig().MAX_INFLIGHT_JOBS)
      const restore = overrideDynamicConfigFieldsForTest(bedrockEmbeddingsBatchConfig, {
        max_inflight_jobs: countLimit,
        creation_retry_delay_ms: 30000,
      })
      quota.beforeRelease(async () => restore())
      expect(await snapshot.limits()).toMatchObject({ allowed: true })
      await snapshot.insertReservation()
      expect(await snapshot.limits()).toEqual({
        allowed: false,
        reason: 'inflight_job_limit_exceeded',
      })
      const cursor = { sweepStartedAt: '2024-01-01T00:00:00.000Z', afterId: randomUUID() }
      const seen = new Set<string>()
      await owned.run(async () => {
        await owned.ready()
        const worker = await owned.createWorker(() =>
          createEmbeddingCreationWorker(
            owned.queue,
            { blockTimeout: 100, promotionInterval: 100 },
            snapshot.dependencies,
          ),
        )
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
      expect(await snapshot.removeOwnedReservations()).toEqual({
        verifiedAbsentCount: 1,
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
        const job = await owned.add(
          type,
          { cursor: createEmptyEmbeddingCursor() },
          creationJobOptions(type),
        )
        if (!job) throw new Error('Expected empty creation sweep job')
        const worker = await owned.createWorker(() =>
          createEmptyEmbeddingCreationWorker(owned.queue),
        )
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
    const config = getRateLimitConfig()
    const imageMinimum = minimumImageBatchSizeMB(config.MIN_RECORDS_PER_JOB)
    const textMinimum = minimumTextBatchSizeMB(config.MIN_RECORDS_PER_JOB)
    const remainingMB = (imageMinimum + textMinimum) / 2
    const reservation = await createEmbeddingFairnessSnapshot(
      quota,
      config.MAX_INFLIGHT_SIZE_MB,
      remainingMB,
    )
    // A positive remainder needs one reservation slot and one admission slot; zero needs only admission.
    expect(reservation.countLimit).toBeLessThanOrEqual(config.MAX_INFLIGHT_JOBS)
    expect(reservation.localGiB * 1024).toBeLessThanOrEqual(config.MAX_INFLIGHT_SIZE_MB)
    const restore = overrideDynamicConfigFieldsForTest(bedrockEmbeddingsBatchConfig, {
      max_inflight_jobs: reservation.countLimit,
      max_job_size_gb: reservation.localGiB,
      creation_retry_delay_ms: 30000,
    })
    quota.beforeRelease(async () => restore())
    const reserved = await reservation.limits()
    if (!reserved.allowed) throw new Error(`Global accounting changed: ${reserved.reason}`)
    expect(reserved.maxRecords).toBeGreaterThanOrEqual(reserved.minRecords)
    expect(reserved.maxSizeMB).toBeCloseTo(remainingMB, 6)
    expect(reserved.maxSizeMB).toBeGreaterThanOrEqual(textMinimum)
    expect(reserved.maxSizeMB).toBeLessThan(imageMinimum)
    expect(reservation.reservationMB).toBeGreaterThanOrEqual(0)
    expect(reservation.reservationMB).toBeLessThan(1024)
    // A completed row contributes to the real hourly query without consuming another active slot.
    expect(await reservation.hourlyRecords()).toBe(reservation.hourlyBefore)
    expect(await quota.insertCompletedControl()).toMatchObject({ records: 1 })
    expect(await reservation.hourlyRecords()).toBe(reservation.hourlyBefore)
    expect(await reservation.limits()).toEqual(reserved)
    const setConcurrency = vi.spyOn(owned.queue, 'setGlobalConcurrency')
    quota.beforeRelease(async () => {
      setConcurrency.mockRestore()
    })
    await owned.run(async () => {
      await owned.ready()
      for (let index = 0; index < 2; index++) {
        await owned.createWorker(() =>
          createEmbeddingCreationWorker(
            owned.queue,
            {
              blockTimeout: 100,
              promotionInterval: 100,
            },
            reservation.dependencies,
          ),
        )
      }
      await Promise.all(owned.workers.map(worker => worker.waitUntilReady()))
      expect(setConcurrency).toHaveBeenCalledTimes(2)
      expect(setConcurrency).toHaveBeenCalledWith(1)
      const cursor = createEmptyEmbeddingCursor()
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
    await reservation.assertPresent()
    expect(await reservation.removeOwnedReservations()).toEqual({
      verifiedAbsentCount: reservation.reservationCount,
      remainingCount: 0,
    })
    expect(await quota.removeOwnedReservations()).toEqual({
      verifiedAbsentCount: 1,
      remainingCount: 0,
    })
  })
})

describe('creation queue global concurrency', () => {
  beforeEach(setupQuota, 25_000)
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
        await owned.createWorker(
          () =>
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
