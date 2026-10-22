import { randomUUID } from 'node:crypto'
import { workerQueueConnection, workerQueuePrefix } from '@data-stores/valkey-glide-mq'
import {
  BEDROCK_EMBEDDINGS_CREATION_JOB_DEFAULTS,
  BEDROCK_EMBEDDINGS_CREATION_QUEUE_NAME,
} from '@queues/bedrock-embeddings-batch/config'
import { creationJobOptions } from '@queues/bedrock-embeddings-batch/enqueues'
import { getBatchCreationLimits } from '@services/bedrock-embeddings-batch/rate-limits'
import { bedrockEmbeddingsBatchConfig } from '@services/bedrock-embeddings/batch/config'
import {
  createOwnedEmbeddingQueue,
  createOwnedEmbeddingQueueWithoutQuota,
} from '@voucha/test-helpers/embedding-creation-events'
import { acquireEmbeddingQuotaFixture } from '@voucha/test-helpers/embedding-creation-quota'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { Queue, Worker, type Job } from 'glide-mq'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createBedrockEmbeddingsCreationWorker } from './creation-worker.mts'

vi.mock<typeof import('glide-mq')>(import('glide-mq'), importOriginal => importOriginal())

describe('native embedding creation worker', () => {
  it('installs the dedicated queue cap used by two public workers', async () => {
    const owned = createOwnedEmbeddingQueueWithoutQuota(
      'global_concurrency',
      {
        connection: workerQueueConnection,
        prefix: `${workerQueuePrefix}-embedding-creation-cap-${randomUUID()}`,
      },
      BEDROCK_EMBEDDINGS_CREATION_QUEUE_NAME,
    )
    const callbackEntered = Promise.withResolvers<void>()
    const releaseCallbacks = Promise.withResolvers<void>()
    owned.releaseOnCleanup(() => releaseCallbacks.resolve())
    const setGlobalConcurrency = vi.spyOn(Queue.prototype, 'setGlobalConcurrency')
    owned.releaseOnCleanup(() => setGlobalConcurrency.mockRestore())
    let activeCallbacks = 0
    let maxActiveCallbacks = 0

    await owned.run(async () => {
      await owned.ready()
      const capInstaller = await owned.createWorker(() =>
        createBedrockEmbeddingsCreationWorker({ prefix: owned.options.prefix }),
      )
      await capInstaller.waitUntilReady()
      await capInstaller.close()
      expect(setGlobalConcurrency).toHaveBeenCalledOnce()
      expect(setGlobalConcurrency).toHaveBeenCalledWith(1)
      const setterResult = setGlobalConcurrency.mock.results[0]
      if (!setterResult || setterResult.type !== 'return')
        throw new Error('The production global-concurrency setter did not complete')
      await setterResult.value

      const first = await owned.add(
        'cap.first',
        {},
        {
          ...BEDROCK_EMBEDDINGS_CREATION_JOB_DEFAULTS,
          ...creationJobOptions(`cap_first_${randomUUID()}`),
        },
      )
      const second = await owned.add(
        'cap.second',
        {},
        {
          ...BEDROCK_EMBEDDINGS_CREATION_JOB_DEFAULTS,
          ...creationJobOptions(`cap_second_${randomUUID()}`),
        },
      )
      if (!first || !second) throw new Error('Expected both public cap-control jobs')

      const processor = async (job: Job) => {
        activeCallbacks++
        maxActiveCallbacks = Math.max(maxActiveCallbacks, activeCallbacks)
        try {
          if (job.name === 'cap.first') callbackEntered.resolve()
          await releaseCallbacks.promise
          return { name: job.name }
        } finally {
          activeCallbacks--
        }
      }
      const workers = await Promise.all(
        Array.from({ length: 2 }, () =>
          owned.createWorker(
            () =>
              new Worker(BEDROCK_EMBEDDINGS_CREATION_QUEUE_NAME, processor, {
                ...owned.options,
                concurrency: 1,
                blockTimeout: 100,
              }),
          ),
        ),
      )
      for (const worker of workers) await worker.waitUntilReady()

      await callbackEntered.promise
      expect(activeCallbacks).toBe(1)
      releaseCallbacks.resolve()
      await Promise.all([
        owned.waitFor(first.id, 'completed'),
        owned.waitFor(second.id, 'completed'),
      ])
      expect(maxActiveCallbacks).toBe(1)
      expect((await owned.queue.getJob(first.id))?.returnvalue).toEqual({ name: 'cap.first' })
      expect((await owned.queue.getJob(second.id))?.returnvalue).toEqual({ name: 'cap.second' })
    })
  })

  it('rejects malformed cursors through the dedicated production worker route', async () => {
    const owned = createOwnedEmbeddingQueueWithoutQuota(
      'invalid_cursor',
      {
        connection: workerQueueConnection,
        prefix: `${workerQueuePrefix}-embedding-creation-invalid-${randomUUID()}`,
      },
      BEDROCK_EMBEDDINGS_CREATION_QUEUE_NAME,
    )
    await owned.run(async () => {
      await owned.ready()
      const worker = await owned.createWorker(() =>
        createBedrockEmbeddingsCreationWorker({ prefix: owned.options.prefix }),
      )
      await worker.waitUntilReady()
      const job = await owned.add(
        'bedrock-embeddings.create_images',
        { cursor: 'invalid' },
        { ...BEDROCK_EMBEDDINGS_CREATION_JOB_DEFAULTS, attempts: 1 },
      )
      if (!job) throw new Error('Expected malformed creation job')
      await owned.waitFor(job.id, 'failed')
      expect(await (await owned.queue.getJob(job.id))?.getState()).toBe('failed')
      expect((await owned.queue.getJob(job.id))?.failedReason).toBe('Invalid embedding scan cursor')
    })
  })

  it('fails unknown creation names on the owned queue without routing them elsewhere', async () => {
    const owned = createOwnedEmbeddingQueueWithoutQuota(
      'unknown_job',
      {
        connection: workerQueueConnection,
        prefix: `${workerQueuePrefix}-embedding-creation-unknown-${randomUUID()}`,
      },
      BEDROCK_EMBEDDINGS_CREATION_QUEUE_NAME,
    )
    await owned.run(async () => {
      await owned.ready()
      const worker = await owned.createWorker(() =>
        createBedrockEmbeddingsCreationWorker({ prefix: owned.options.prefix }),
      )
      await worker.waitUntilReady()
      const job = await owned.add(
        'bedrock-embeddings.create_unknown',
        {},
        { ...BEDROCK_EMBEDDINGS_CREATION_JOB_DEFAULTS, attempts: 1 },
      )
      if (!job) throw new Error('Expected unknown creation job')
      await owned.waitFor(job.id, 'failed')
      const failed = await owned.queue.getJob(job.id)
      expect(await failed?.getState()).toBe('failed')
      expect(failed?.id).toBe(job.id)
      expect(failed?.name).toBe('bedrock-embeddings.create_unknown')
      expect(failed?.attemptsMade).toBe(1)
      expect(failed?.failedReason).toBe(
        'No embedding creation handler for bedrock-embeddings.create_unknown',
      )
    })
  })
})

describe('native embedding creation recovery after capacity release', () => {
  let quota: Awaited<ReturnType<typeof acquireEmbeddingQuotaFixture>>

  beforeEach(async () => {
    quota = await acquireEmbeddingQuotaFixture()
  }, 25_000)

  it('completes the same delayed image job after its owned reservation is removed', async () => {
    const owned = createOwnedEmbeddingQueue(
      quota,
      'capacity_reentry',
      {
        connection: workerQueueConnection,
        prefix: `${workerQueuePrefix}-embedding-creation-reentry-${randomUUID()}`,
      },
      BEDROCK_EMBEDDINGS_CREATION_QUEUE_NAME,
    )
    const restore = overrideDynamicConfigFieldsForTest(bedrockEmbeddingsBatchConfig, {
      max_inflight_jobs: 1,
      creation_retry_delay_ms: 30_000,
    })
    quota.beforeRelease(async () => restore())
    await quota.insertSubmittedControl()
    const exhaustedCursor = {
      sweepStartedAt: '2024-01-01T00:00:00.000Z',
      afterId: '00000000-0000-0000-0000-000000000000',
    }
    const name = 'bedrock-embeddings.create_images'
    const options = {
      ...BEDROCK_EMBEDDINGS_CREATION_JOB_DEFAULTS,
      ...creationJobOptions(`capacity_reentry_${randomUUID()}`),
    }

    await owned.run(async () => {
      await owned.ready()
      const worker = await owned.createWorker(() =>
        createBedrockEmbeddingsCreationWorker({ prefix: owned.options.prefix }),
      )
      await worker.waitUntilReady()
      const job = await owned.add(name, { cursor: exhaustedCursor }, options)
      if (!job) throw new Error('Expected real image creation job')
      await owned.waitFor(job.id, 'delay-changed')
      const delayed = await owned.queue.getJob(job.id)
      expect(await job.getState()).toBe('delayed')
      expect(delayed?.id).toBe(job.id)
      expect(delayed?.data).toEqual({ cursor: exhaustedCursor })
      expect(delayed?.attemptsMade).toBe(0)
      expect(await owned.add(name, { cursor: exhaustedCursor }, options)).toBeNull()

      expect(await quota.removeOwnedReservations()).toEqual({
        verifiedAbsentCount: 1,
        remainingCount: 0,
      })
      expect((await getBatchCreationLimits()).allowed).toBe(true)
      await owned.promote(job)
      await owned.waitFor(job.id, 'completed')
      const completed = await owned.queue.getJob(job.id)
      expect(await completed?.getState()).toBe('completed')
      expect(completed?.id).toBe(job.id)
      expect(completed?.data).toEqual(delayed?.data)
      expect(completed?.attemptsMade).toBe(0)
      expect(completed?.returnvalue).toEqual({ empty: true, hasMore: false })
    })
  })
})
