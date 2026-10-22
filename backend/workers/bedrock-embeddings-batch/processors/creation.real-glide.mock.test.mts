import { randomUUID } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { creationJobOptions } from '@queues/bedrock-embeddings-batch/enqueues'
import { parseEmbeddingScanCursor } from '@queues/bedrock-embeddings-batch/payload/job-payload'
import { workerQueueConnection, workerQueuePrefix } from '@data-stores/valkey-glide-mq'
import {
  BEDROCK_EMBEDDINGS_CREATION_JOB_DEFAULTS,
  BEDROCK_EMBEDDINGS_CREATION_QUEUE_NAME,
} from '@queues/bedrock-embeddings-batch/config'
import {
  bedrockEmbeddingsBatchConfig,
  getRateLimitConfig,
} from '@services/bedrock-embeddings/batch/config'
import {
  minimumImageBatchSizeMB,
  minimumTextBatchSizeMB,
} from '@services/bedrock-embeddings/batch/input-size-limits'
import { getBatchCreationLimits } from '@services/bedrock-embeddings-batch/rate-limits'
import {
  getActiveBatchStats,
  getBatchRecordsCreatedInLastHour,
} from '@services/bedrock-embeddings/batch/orchestrator/poll-queries'
import { getCpuProviderCooldownRemainingMs } from '@services/bedrock-embeddings/provider-cooldown'
import { getQueueDomainControl } from '../../../services/queue-domain-controls/index.mts'
import type { BatchJobType } from '@services/bedrock-embeddings/batch/types'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { acquireEmbeddingQuotaFixture } from '@voucha/test-helpers/embedding-creation-quota'
import { createOwnedEmbeddingQueue } from '@voucha/test-helpers/embedding-creation-events'
import { createBedrockEmbeddingsCreationWorker } from './creation-worker.mts'

vi.mock<typeof import('glide-mq')>(import('glide-mq'), importOriginal => importOriginal())

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
        BEDROCK_EMBEDDINGS_CREATION_QUEUE_NAME,
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
      const options = {
        ...BEDROCK_EMBEDDINGS_CREATION_JOB_DEFAULTS,
        ...creationJobOptions(`${type}_batch`),
      }
      const activated: string[] = []
      await owned.run(async () => {
        await owned.ready()
        const worker = await owned.createWorker(() =>
          createBedrockEmbeddingsCreationWorker({ prefix: owned.options.prefix }),
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

  it('lets ready creation work pass a real image capacity delay across two capped workers', async () => {
    const owned = createOwnedEmbeddingQueue(
      quota,
      'fairness',
      {
        connection: workerQueueConnection,
        prefix: `${workerQueuePrefix}-embedding-creation-fairness-${randomUUID()}`,
      },
      BEDROCK_EMBEDDINGS_CREATION_QUEUE_NAME,
    )
    const config = getRateLimitConfig()
    const imageMinimum = minimumImageBatchSizeMB(config.MIN_RECORDS_PER_JOB)
    const textMinimum = minimumTextBatchSizeMB(config.MIN_RECORDS_PER_JOB)
    const remainingMB = (imageMinimum + textMinimum) / 2
    const activeBefore = await getActiveBatchStats()
    const localGiB = Math.ceil((activeBefore.inputSizeMB + remainingMB) / 1024)
    const reservationMB = localGiB * 1024 - activeBefore.inputSizeMB - remainingMB
    const reservationCount = reservationMB > 0 ? 1 : 0
    const countLimit = activeBefore.count + reservationCount + 1
    if (reservationMB <= 0 || reservationMB >= 1024)
      throw new Error('Could not create a sub-GiB fairness reservation')
    if (localGiB * 1024 > config.MAX_INFLIGHT_SIZE_MB || countLimit > config.MAX_INFLIGHT_JOBS)
      throw new Error('Ambient embedding usage leaves no room for the fairness reservation')
    const restore = overrideDynamicConfigFieldsForTest(bedrockEmbeddingsBatchConfig, {
      max_inflight_jobs: countLimit,
      max_job_size_gb: localGiB,
      creation_retry_delay_ms: 30_000,
    })
    quota.beforeRelease(async () => restore())
    const reservation = await quota.insertSubmittedReservation(reservationMB)
    await quota.assertSubmittedReservation(reservation.id, reservationMB)
    const activeWithReservation = await getActiveBatchStats()
    const hourlyRecordsBeforeCompletedControl = await getBatchRecordsCreatedInLastHour()
    await quota.insertCompletedControl()
    expect(await getBatchRecordsCreatedInLastHour()).toBe(hourlyRecordsBeforeCompletedControl + 1)
    expect(await getActiveBatchStats()).toEqual(activeWithReservation)
    const reservedLimits = await getBatchCreationLimits()
    if (!reservedLimits.allowed)
      throw new Error(`Owned reservation blocked admission: ${reservedLimits.reason}`)
    expect(reservedLimits.maxRecords).toBeGreaterThanOrEqual(reservedLimits.minRecords)
    expect(reservedLimits.maxSizeMB).toBeCloseTo(remainingMB, 6)
    expect(reservedLimits.maxSizeMB).toBeGreaterThanOrEqual(textMinimum)
    expect(reservedLimits.maxSizeMB).toBeLessThan(imageMinimum)

    const fairnessCursor = {
      sweepStartedAt: '2024-01-01T00:00:00.000Z',
      afterId: 'ffffffff-ffff-7fff-bfff-ffffffffffff',
    }
    await owned.run(async () => {
      await owned.ready()
      const workers = await Promise.all(
        Array.from({ length: 2 }, () =>
          owned.createWorker(() =>
            createBedrockEmbeddingsCreationWorker({ prefix: owned.options.prefix }),
          ),
        ),
      )
      for (const worker of workers) {
        await worker.waitUntilReady()
      }

      const imageName = 'bedrock-embeddings.create_images'
      const imageOptions = {
        ...BEDROCK_EMBEDDINGS_CREATION_JOB_DEFAULTS,
        ...creationJobOptions(`fairness_images_${randomUUID()}`),
      }
      const image = await owned.add(imageName, { cursor: fairnessCursor }, imageOptions)
      if (!image) throw new Error('Expected production image creation job')
      await owned.waitFor(image.id, 'delay-changed')
      expect(await image.getState()).toBe('delayed')
      const delayed = await owned.queue.getJob(image.id)
      expect(delayed?.data).toEqual({ cursor: fairnessCursor })
      expect(parseEmbeddingScanCursor(delayed?.data)).toEqual(fairnessCursor)
      expect(delayed?.attemptsMade).toBe(0)
      expect(await owned.add(imageName, { cursor: fairnessCursor }, imageOptions)).toBeNull()

      const text = await owned.add(
        'bedrock-embeddings.create_topics',
        { cursor: fairnessCursor },
        {
          ...BEDROCK_EMBEDDINGS_CREATION_JOB_DEFAULTS,
          ...creationJobOptions(`fairness_topics_${randomUUID()}`),
        },
      )
      if (!text) throw new Error('Expected ready topics creation')
      await owned.waitFor(text.id, 'completed')
      expect(await text.getState()).toBe('completed')
      expect((await owned.queue.getJob(text.id))?.returnvalue).toMatchObject({ empty: true })
      await quota.assertSubmittedReservation(reservation.id, reservationMB)
      expect(await image.getState()).toBe('delayed')
      expect((await owned.queue.getJob(image.id))?.data).toEqual(delayed?.data)
      expect((await owned.queue.getJob(image.id))?.attemptsMade).toBe(0)
      expect(await owned.add(imageName, {}, imageOptions)).toBeNull()
      expect(await getBatchCreationLimits()).toEqual(reservedLimits)
    })
    // owned.run drains both production workers before the reservation is removed.
    expect(await quota.assertSubmittedReservation(reservation.id, reservationMB)).toBeUndefined()
    expect(await quota.removeOwnedReservations()).toEqual({
      verifiedAbsentCount: 2,
      remainingCount: 0,
    })
  })

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
        BEDROCK_EMBEDDINGS_CREATION_QUEUE_NAME,
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
        ...BEDROCK_EMBEDDINGS_CREATION_JOB_DEFAULTS,
        ...creationJobOptions(`${type}_batch`),
      }
      await owned.run(async () => {
        await owned.ready()
        const worker = await owned.createWorker(() =>
          createBedrockEmbeddingsCreationWorker({ prefix: owned.options.prefix }),
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
