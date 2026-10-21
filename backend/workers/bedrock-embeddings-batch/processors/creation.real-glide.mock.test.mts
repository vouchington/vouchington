import { randomUUID } from 'node:crypto'
import { Worker, type Job } from 'glide-mq'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { creationJobOptions } from '@queues/bedrock-embeddings-batch/enqueues'
import { delayEmbeddingCreationJob } from '@queues/bedrock-embeddings-batch/payload/creation-deferral'
import { parseEmbeddingScanCursor } from '@queues/bedrock-embeddings-batch/payload/job-payload'
import { workerQueueConnection, workerQueuePrefix } from '@data-stores/valkey-glide-mq'
import { bedrockEmbeddingsBatchConfig } from '@services/bedrock-embeddings/batch/config'
import {
  minimumImageBatchSizeMB,
  minimumTextBatchSizeMB,
} from '@services/bedrock-embeddings/batch/input-size-limits'
import { getBatchCreationLimits } from '@services/bedrock-embeddings-batch/rate-limits'
import { getCpuProviderCooldownRemainingMs } from '@services/bedrock-embeddings/provider-cooldown'
import { getQueueDomainControl } from '../../../services/queue-domain-controls/index.mts'
import type { BatchJobType } from '@services/bedrock-embeddings/batch/types'
import { requireBackgroundCpuJob } from '../../../queues/background-cpu/enqueues/registry.mts'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { acquireEmbeddingQuotaFixture } from '@voucha/test-helpers/embedding-creation-quota'
import { createOwnedEmbeddingQueue } from '@voucha/test-helpers/embedding-creation-events'
import { createBackgroundCpuWorker } from '../../background-cpu/workers/create-worker.mts'
import { BACKGROUND_CPU_HANDLERS } from '../../background-cpu/processors/handlers.mts'
import { BACKGROUND_CPU_QUEUE_NAME } from '../../../queues/background-cpu/config.mts'

vi.mock<typeof import('glide-mq')>(import('glide-mq'), importOriginal => importOriginal())

const connection = { connection: workerQueueConnection, prefix: workerQueuePrefix }
const creationTypes = ['topics', 'posts', 'rss_feed_items', 'crawl_chunks', 'images'] as const
const exhaustedCursor = {
  sweepStartedAt: '2024-01-01T00:00:00.000Z',
  afterId: '00000000-0000-0000-0000-000000000000',
}

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
    'delays actual CPU factory %s on its original job when committed capacity is full',
    async (type: BatchJobType) => {
      const owned = createOwnedEmbeddingQueue(
        quota,
        `admission_${type}`,
        {
          connection: workerQueueConnection,
          prefix: `${workerQueuePrefix}-embedding-creation-cpu-${type}-${randomUUID()}`,
        },
        BACKGROUND_CPU_QUEUE_NAME,
      )
      const restore = overrideDynamicConfigFieldsForTest(bedrockEmbeddingsBatchConfig, {
        max_inflight_jobs: 1,
        creation_retry_delay_ms: 30_000,
      })
      quota.beforeRelease(async () => restore())
      await quota.insertSubmittedControl()
      expect(await getBatchCreationLimits()).toEqual({
        allowed: false,
        reason: 'inflight_job_limit_exceeded',
      })
      expect((await getQueueDomainControl('bedrock-embeddings')).paused).toBe(false)
      expect(await getCpuProviderCooldownRemainingMs('bedrock-embeddings:creation')).toBeNull()

      const name = `bedrock-embeddings.create_${type}`
      const definition = requireBackgroundCpuJob(name)
      const options = { ...definition.options, ...creationJobOptions(`${type}_batch`) }
      const activated: string[] = []
      await owned.run(async () => {
        await owned.ready()
        const worker = await owned.createWorker(() =>
          createBackgroundCpuWorker({
            handlers: BACKGROUND_CPU_HANDLERS,
            domains: ['bedrock-embeddings'],
            prefix: owned.options.prefix,
            concurrency: 1,
            blockTimeout: 1_000,
            promotionInterval: 2_500,
          }),
        )
        worker.on('active', job => activated.push(job.name))
        await worker.waitUntilReady()
        const job = await owned.add(name, {}, options)
        if (!job) throw new Error('Expected creation route job')
        await owned.waitFor(job.id, 'delay-changed')
        const stored = await owned.queue.getJob(job.id)
        expect(await stored?.getState()).toBe('delayed')
        expect(stored?.id).toBe(job.id)
        expect(stored?.name).toBe(name)
        expect(stored?.data).toEqual({ cursor: { sweepStartedAt: expect.any(String) } })
        expect(parseEmbeddingScanCursor(stored?.data)).toEqual({
          sweepStartedAt: expect.any(String),
        })
        const firstData = stored?.data
        expect(stored?.attemptsMade).toBe(0)
        expect(await owned.add(name, {}, options)).toBeNull()

        await owned.promote(job)
        await owned.waitFor(job.id, 'delay-changed', 2)
        const repeated = await owned.queue.getJob(job.id)
        expect(await repeated?.getState()).toBe('delayed')
        expect(repeated?.id).toBe(job.id)
        expect(repeated?.data).toEqual(firstData)
        expect(repeated?.attemptsMade).toBe(0)
        expect(await owned.add(name, {}, options)).toBeNull()
        expect(activated).toEqual([name, name])
      })
      expect(await quota.removeOwnedReservations()).toEqual({
        verifiedAbsentCount: 1,
        remainingCount: 0,
      })
    },
  )

  it.each(creationTypes)(
    'completes actual CPU factory %s with an exhausted cursor and available capacity',
    async (type: BatchJobType) => {
      const owned = createOwnedEmbeddingQueue(
        quota,
        `empty_${type}`,
        {
          connection: workerQueueConnection,
          prefix: `${workerQueuePrefix}-embedding-creation-empty-${type}-${randomUUID()}`,
        },
        BACKGROUND_CPU_QUEUE_NAME,
      )
      const restore = overrideDynamicConfigFieldsForTest(bedrockEmbeddingsBatchConfig, {
        max_inflight_jobs: 10_000,
        max_requests_per_hour: 100_000_000,
        max_requests_per_file: 1_000_000,
        max_file_size_gb: 10,
        max_job_size_gb: 1_000,
        min_records_per_job: 1,
      })
      quota.beforeRelease(async () => restore())
      const limits = await getBatchCreationLimits()
      expect(limits.allowed).toBe(true)
      if (!limits.allowed) throw new Error(`Expected real creation capacity: ${limits.reason}`)
      expect(limits.maxRecords).toBeGreaterThanOrEqual(limits.minRecords)
      expect(limits.maxSizeMB).toBeGreaterThanOrEqual(
        type === 'images'
          ? minimumImageBatchSizeMB(limits.minRecords)
          : minimumTextBatchSizeMB(limits.minRecords),
      )
      expect((await getQueueDomainControl('bedrock-embeddings')).paused).toBe(false)
      expect(await getCpuProviderCooldownRemainingMs('bedrock-embeddings:creation')).toBeNull()

      const name = `bedrock-embeddings.create_${type}`
      const options = {
        ...requireBackgroundCpuJob(name).options,
        ...creationJobOptions(`${type}_batch`),
      }
      await owned.run(async () => {
        await owned.ready()
        const worker = await owned.createWorker(() =>
          createBackgroundCpuWorker({
            handlers: BACKGROUND_CPU_HANDLERS,
            domains: ['bedrock-embeddings'],
            prefix: owned.options.prefix,
            concurrency: 1,
            blockTimeout: 1_000,
            promotionInterval: 2_500,
          }),
        )
        await worker.waitUntilReady()
        const job = await owned.add(name, { cursor: exhaustedCursor }, options)
        if (!job) throw new Error('Expected exhausted creation job')
        await owned.waitFor(job.id, 'completed')
        const stored = await owned.queue.getJob(job.id)
        expect(stored?.id).toBe(job.id)
        expect(stored?.name).toBe(name)
        expect(await stored?.getState()).toBe('completed')
        expect(stored?.returnvalue).toEqual({ empty: true, hasMore: false })
        expect(stored?.data).toEqual({ cursor: exhaustedCursor })
        expect(stored?.attemptsMade).toBe(0)
        expect(await owned.queue.getJobs('delayed')).toEqual([])
        expect(await owned.queue.getJobs('waiting')).toEqual([])
      })
    },
  )
})
