import { randomUUID } from 'node:crypto'
import { Queue, Worker, type Job } from 'glide-mq'
import { describe, expect, it, vi } from 'vitest'
import { workerQueueConnection, workerQueuePrefix } from '@data-stores/valkey-glide-mq'
import { creationJobOptions } from '@queues/bedrock-embeddings-batch/enqueues'
import {
  bedrockEmbeddingsBatchConfig,
  BEDROCK_BATCH_MAX_VALUES,
} from '@services/bedrock-embeddings/batch/config'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import {
  insertTestEmbeddingsBatch,
  cleanupTestEmbeddingsBatches,
} from '@voucha/test-helpers/entities/bedrock-embeddings-batches'
import { createEmbeddingCreationWorker } from '../workers/bedrock-embeddings-batch-creation.mts'
import { delayEmbeddingCreationJob } from '@queues/bedrock-embeddings-batch/payload/creation-deferral'
import * as batchRateLimits from '@services/bedrock-embeddings-batch/rate-limits'

vi.mock<typeof import('glide-mq')>(import('glide-mq'), importOriginal => importOriginal())

const connection = { connection: workerQueueConnection, prefix: workerQueuePrefix }

describe('same-job embedding continuation', () => {
  it('preserves a delayed cursor and coalesces later roots through repeated capacity denials', async () => {
    const name = `embedding_creation_retry_${randomUUID()}`
    const queue = new Queue(name, connection)
    const cursor = {
      sweepStartedAt: new Date().toISOString(),
      afterId: randomUUID(),
      pendingImageIds: [randomUUID()],
    }
    const firstStarted = Promise.withResolvers<void>()
    const secondStarted = Promise.withResolvers<void>()
    const completed = Promise.withResolvers<void>()
    let capacityAvailable = false
    let advanced = false
    const nextCursor = { ...cursor, afterId: randomUUID() }
    const seen: { id: string; data: unknown }[] = []
    const worker: Worker = new Worker(
      name,
      async (job: Job) => {
        seen.push({ id: job.id, data: job.data })
        if (!capacityAvailable) {
          if (seen.length === 1) firstStarted.resolve()
          else secondStarted.resolve()
          await delayEmbeddingCreationJob(job, cursor, 30000)
        } else if (!advanced) {
          advanced = true
          await delayEmbeddingCreationJob(job, nextCursor)
        }
      },
      { ...connection, concurrency: 1, blockTimeout: 1000 },
    )
    worker.once('completed', () => completed.resolve())
    const firstParked = nextDrained(worker)
    try {
      await worker.waitUntilReady()
      const first = await queue.add('images', {}, creationJobOptions('images_batch'))
      if (!first) throw new Error('Expected initial creation job')
      await firstStarted.promise
      await firstParked
      expect(await first.getState()).toBe('delayed')
      const delayed = await queue.getJob(first.id)
      expect(delayed?.data).toEqual({ cursor })
      for (let attempt = 0; attempt < 3; attempt++)
        expect(await queue.add('images', {}, creationJobOptions('images_batch'))).toBeNull()
      const secondParked = nextDrained(worker)
      await first.promote()
      await secondStarted.promise
      await secondParked
      expect(await first.getState()).toBe('delayed')
      expect(await queue.add('images', {}, creationJobOptions('images_batch'))).toBeNull()
      expect((await queue.getJob(first.id))?.attemptsMade).toBe(0)
      capacityAvailable = true
      await first.promote()
      await completed.promise
      expect(seen.map(item => item.id)).toEqual([first.id, first.id, first.id, first.id])
      expect(seen.map(item => item.data)).toEqual([
        {},
        { cursor },
        { cursor },
        { cursor: nextCursor },
      ])
      expect(await queue.add('images', {}, creationJobOptions('images_batch'))).not.toBeNull()
    } finally {
      await worker.close(true)
      await queue.obliterate({ force: true })
      await queue.close()
    }
  })
  it.each(['topics', 'posts', 'rss_feed_items', 'crawl_chunks', 'images'])(
    'parks production %s on the original job when provider capacity is full',
    async type => {
      const id = `capacity-${randomUUID()}`
      await insertTestEmbeddingsBatch({ id, bedrockStatus: 'Submitted' })
      const restore = overrideDynamicConfigFieldsForTest(bedrockEmbeddingsBatchConfig, {
        max_inflight_jobs: 1,
        creation_retry_delay_ms: 30000,
      })
      const name = `embedding_creation_routes_${randomUUID()}`
      const queue = new Queue(name, connection)
      const seen = new Set<string>()
      const cursor = { sweepStartedAt: new Date().toISOString(), afterId: randomUUID() }
      const job = await queue.add(type, { cursor }, creationJobOptions(type))
      if (!job) throw new Error('Expected creation route job')
      const worker = await createEmbeddingCreationWorker(queue)
      const parked = nextDrained(worker)
      worker.on('active', job => seen.add(job.name))
      try {
        await worker.waitUntilReady()
        await parked
        expect(await job.getState()).toBe('delayed')
        expect((await queue.getJob(job.id))?.data).toEqual({ cursor })
        expect(await queue.add(type, {}, creationJobOptions(type))).toBeNull()
        expect([...seen]).toEqual([type])
      } finally {
        await worker.close(true)
        await queue.obliterate({ force: true })
        await queue.close()
        restore()
        await cleanupTestEmbeddingsBatches([id])
      }
    },
  )

  it.each(['topics', 'posts', 'rss_feed_items', 'crawl_chunks', 'images', 'unknown'])(
    'drains an empty fixed %s sweep or rejects an unknown creation type',
    async type => {
      const restore = overrideDynamicConfigFieldsForTest(bedrockEmbeddingsBatchConfig, {
        max_inflight_jobs: BEDROCK_BATCH_MAX_VALUES.max_inflight_jobs,
        max_requests_per_hour: BEDROCK_BATCH_MAX_VALUES.max_requests_per_hour,
        max_job_size_gb: BEDROCK_BATCH_MAX_VALUES.max_job_size_gb,
        min_records_per_job: 1,
        max_scan_rows_per_run: 1,
      })
      const queue = new Queue(`embedding_creation_empty_${randomUUID()}`, connection)
      const cursor = {
        sweepStartedAt: new Date().toISOString(),
        afterId: '00000000-0000-0000-0000-000000000000',
      }
      const job = await queue.add(type, { cursor }, creationJobOptions(type))
      if (!job) throw new Error('Expected empty creation sweep job')
      const worker = await createEmbeddingCreationWorker(queue)
      const settled = whenJobSettles(worker, job.id)
      try {
        await worker.waitUntilReady()
        expect(await settled).toBe(type === 'unknown' ? 'failed' : 'completed')
        const stored = await queue.getJob(job.id)
        expect(stored).toMatchObject(
          type === 'unknown'
            ? { failedReason: 'Unknown creation job type: unknown' }
            : { returnvalue: { empty: true, hasMore: false } },
        )
      } finally {
        await worker.close(true)
        await queue.obliterate({ force: true })
        await queue.close()
        restore()
      }
    },
  )

  it('yields an image capacity delay to text work while preserving the global creation cap', async () => {
    let calls = 0
    const limits = vi
      .spyOn(batchRateLimits, 'getBatchCreationLimits')
      .mockImplementation(async () => {
        calls += 1
        if (calls === 1) {
          return { allowed: true, maxRecords: 10, maxSizeMB: 0.01, minRecords: 200 }
        }
        return { allowed: true, maxRecords: 1000, maxSizeMB: 100, minRecords: 1 }
      })
    const restore = overrideDynamicConfigFieldsForTest(bedrockEmbeddingsBatchConfig, {
      creation_retry_delay_ms: 30000,
    })
    const queue = new Queue(`embedding_creation_mixed_${randomUUID()}`, connection)
    const setConcurrency = vi.spyOn(queue, 'setGlobalConcurrency')
    const firstWorker = await createEmbeddingCreationWorker(queue)
    const secondWorker = await createEmbeddingCreationWorker(queue)
    const workers = [firstWorker, secondWorker]
    const textCompleted = Promise.withResolvers<void>()
    for (const worker of workers)
      worker.on('completed', job => {
        if (job.name === 'topics') textCompleted.resolve()
      })
    const cursor = {
      sweepStartedAt: new Date().toISOString(),
      afterId: '00000000-0000-0000-0000-000000000000',
    }
    const imageParked = nextDrained(workers)
    try {
      await Promise.all(workers.map(worker => worker.waitUntilReady()))
      expect(setConcurrency).toHaveBeenCalledTimes(2)
      expect(setConcurrency).toHaveBeenCalledWith(1)
      const image = await queue.add('images', { cursor }, creationJobOptions('mixed_images'))
      if (!image) throw new Error('Expected image chain')
      await imageParked
      expect(await image.getState()).toBe('delayed')
      const text = await queue.add('topics', { cursor }, creationJobOptions('mixed_topics'))
      if (!text) throw new Error('Expected text job')
      await textCompleted.promise
      expect(await image.getState()).toBe('delayed')
      expect((await queue.getJob(image.id))?.data).toEqual({ cursor })
      expect(await queue.add('images', {}, creationJobOptions('mixed_images'))).toBeNull()
    } finally {
      limits.mockRestore()
      await Promise.all(workers.map(worker => worker.close(true)))
      await queue.obliterate({ force: true })
      await queue.close()
      restore()
    }
  })
})

describe('creation queue global concurrency', () => {
  it('serializes creation jobs across workers without retaining a delayed ordering lane', async () => {
    const connection = { connection: workerQueueConnection, prefix: workerQueuePrefix }
    const name = `embedding_creation_global_${randomUUID()}`
    const queue = new Queue(name, connection)
    await queue.setGlobalConcurrency(1)
    await queue.add('images', {}, creationJobOptions('images'))
    await queue.add('topics', {}, creationJobOptions('topics'))
    const firstStarted = Promise.withResolvers<void>()
    const releaseFirst = Promise.withResolvers<void>()
    let active = 0
    let maxActive = 0
    let completed = 0
    const bothDone = Promise.withResolvers<void>()
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
    const workers = [
      new Worker(name, processor, { ...connection, concurrency: 2, blockTimeout: 1000 }),
      new Worker(name, processor, { ...connection, concurrency: 2, blockTimeout: 1000 }),
    ]
    try {
      await Promise.all(workers.map(worker => worker.waitUntilReady()))
      await firstStarted.promise
      // Both workers can claim ready jobs while the first processor holds the provider reservation.
      expect((await queue.getJobCounts()).active).toBe(1)
      expect(active).toBe(1)
      releaseFirst.resolve()
      await bothDone.promise
      expect(maxActive).toBe(1)
    } finally {
      releaseFirst.resolve()
      await Promise.all(workers.map(worker => worker.close(true)))
      await queue.obliterate({ force: true })
      await queue.close()
    }
  })
})

function nextDrained(workers: Worker | readonly Worker[]): Promise<void> {
  const list = Array.isArray(workers) ? workers : [workers]
  return new Promise(resolve => {
    const onDrained = () => {
      for (const worker of list) worker.off('drained', onDrained)
      resolve()
    }
    for (const worker of list) worker.on('drained', onDrained)
  })
}

function whenJobSettles(worker: Worker, jobId: string): Promise<'completed' | 'failed'> {
  return new Promise(resolve => {
    function onCompleted(settled: Job): void {
      finish('completed', settled)
    }
    function onFailed(settled: Job): void {
      finish('failed', settled)
    }
    function finish(state: 'completed' | 'failed', settled: Job): void {
      if (settled.id !== jobId) return
      worker.off('completed', onCompleted)
      worker.off('failed', onFailed)
      resolve(state)
    }
    worker.on('completed', onCompleted)
    worker.on('failed', onFailed)
  })
}
