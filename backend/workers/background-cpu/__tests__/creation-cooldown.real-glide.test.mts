import { randomUUID } from 'node:crypto'
import { v7 as uuidv7 } from 'uuid'
import { Worker } from 'glide-mq'
import { throwRateLimited } from '@vouchington/queue-errors'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { workerQueueConnection, workerQueuePrefix } from '@data-stores/valkey-core/glide-mq-client'
import { BACKGROUND_CPU_QUEUE_NAME } from '@queues/background-cpu/config'
import { requireBackgroundCpuJob } from '@queues/background-cpu/enqueues/registry'
import { creationJobOptions } from '@queues/gemini-embeddings-batch/enqueues'
import {
  GEMINI_BATCH_MAX_VALUES,
  geminiEmbeddingsBatchConfig,
} from '@services/embeddings/batch/config'
import { getCpuProviderCooldownRemainingMs } from '@services/embeddings/provider-cooldown'
import { acquireEmbeddingCreationCooldown } from '@voucha/test-helpers/embedding-creation-cooldown'
import { acquireEmbeddingQuotaFixture } from '@voucha/test-helpers/embedding-creation-quota'
import { createOwnedEmbeddingQueue } from '@voucha/test-helpers/embedding-creation-events'
import { waitForRealGlideEvent } from '@voucha/test-helpers/real-glide-terminal-deadline'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import {
  getTestBatchIdByJobName,
  cleanupTestEmbeddingsBatches,
} from '@voucha/test-helpers/entities/gemini-embeddings-batches'
import {
  createTestUserDirect,
  hardDeleteTestTopic,
  hardDeleteTestUser,
  insertTestTopic,
} from '@voucha/test-helpers'
import { BACKGROUND_CPU_HANDLERS } from '../processors/handlers.mts'
import { createBackgroundCpuWorker } from '../workers/create-worker.mts'
import { createVertexHttpFixture } from '@voucha/test-helpers/vertex-http'

describe('creation admission on real GlideMQ', () => {
  beforeEach(() => {
    vi.stubEnv('ENVIRONMENT', 'staging')
  })
  afterEach(() => vi.unstubAllEnvs())

  // no-mistakes-timeout-reason: real GlideMQ worker drain for creation cooldown recheck after S3 upload
  it('rechecks shared cooldown after S3 upload before submitting a creation batch', async ({
    signal,
  }) => {
    const fixture = await acquireEmbeddingQuotaFixture()
    const cooldown = await acquireEmbeddingCreationCooldown(signal)
    cooldown.beforeRelease(() => fixture.close())
    const owned = createOwnedEmbeddingQueue(
      fixture,
      'cooldown_during_upload',
      {
        connection: workerQueueConnection,
        prefix: `${workerQueuePrefix}-creation-cooldown-${randomUUID()}`,
      },
      BACKGROUND_CPU_QUEUE_NAME,
    )
    const restore = overrideDynamicConfigFieldsForTest(geminiEmbeddingsBatchConfig, {
      min_records_per_job: 1,
      max_requests_per_hour: GEMINI_BATCH_MAX_VALUES.max_requests_per_hour,
      max_inflight_jobs: GEMINI_BATCH_MAX_VALUES.max_inflight_jobs,
      max_job_size_gb: GEMINI_BATCH_MAX_VALUES.max_job_size_gb,
      max_scan_rows_per_run: 10_000,
    })
    const user = await createTestUserDirect()
    const topicId = await insertTestTopic({
      id: uuidv7({ msecs: 1_000 }),
      name: `Cooldown topic ${randomUUID()}`,
      slug: `cooldown-${randomUUID()}`,
      createdById: user.id,
    })
    const jobName = `projects/synthetic-project/locations/us/batchPredictionJobs/${randomUUID().replaceAll('-', '')}`
    const uploadEntered = Promise.withResolvers<void>()
    const releaseUpload = Promise.withResolvers<void>()
    owned.releaseOnCleanup(() => releaseUpload.resolve())
    const vertex = createVertexHttpFixture()
    let uploadCount = 0
    const requests = vertex.batchCreationResponses({
      onUpload: async () => {
        if (uploadCount++ === 0) {
          uploadEntered.resolve()
          await releaseUpload.promise
        }
      },
      onSubmit: () => jobName,
    })
    const restoreHttp = vertex.activate()
    fixture.beforeRelease(async () => {
      const batchId = await getTestBatchIdByJobName(jobName)
      if (batchId) await cleanupTestEmbeddingsBatches([batchId])
      await hardDeleteTestTopic(topicId)
      await hardDeleteTestUser(user.id)
      restore()
    })
    try {
      const topicDefinition = requireBackgroundCpuJob('gemini-embeddings.create_topics')
      const imageDefinition = requireBackgroundCpuJob('gemini-embeddings.create_images')
      let imageAttempts = 0
      const handlers = BACKGROUND_CPU_HANDLERS.map(handler =>
        handler.job.name === imageDefinition.name
          ? {
              ...handler,
              handle: () => {
                imageAttempts += 1
                if (imageAttempts === 1)
                  throwRateLimited(3_000, new Error('Vertex request throttled'), {
                    RateLimitError: Worker.RateLimitError,
                  })
              },
            }
          : handler,
      )
      const firstWorker = await owned.createWorker(() =>
        createBackgroundCpuWorker({
          handlers,
          domains: ['gemini-embeddings'],
          prefix: owned.options.prefix,
          concurrency: 1,
          blockTimeout: 1_000,
          promotionInterval: 50,
        }),
      )
      await Promise.all([owned.ready(), firstWorker.waitUntilReady()])
      const cursor = {
        sweepStartedAt: '1970-01-01T00:00:02.000Z',
        afterId: uuidv7({ msecs: 1_500 }),
      }
      const topic = await owned.add(
        topicDefinition.name,
        { cursor },
        { ...topicDefinition.options, ...creationJobOptions(randomUUID()) },
      )
      if (!topic) throw new Error('Expected topic creation job')
      await uploadEntered.promise

      const secondWorker = await owned.createWorker(() =>
        createBackgroundCpuWorker({
          handlers,
          domains: ['gemini-embeddings'],
          prefix: owned.options.prefix,
          concurrency: 1,
          blockTimeout: 1_000,
          promotionInterval: 50,
        }),
      )
      await secondWorker.waitUntilReady()
      const image = await owned.add(
        imageDefinition.name,
        {},
        { ...imageDefinition.options, ...creationJobOptions(randomUUID()) },
      )
      if (!image) throw new Error('Expected image cooldown job')
      await owned.waitFor(image.id, 'delay-changed')
      expect(imageAttempts).toBe(1)
      await cooldown.witnessOwnWrite()
      expect(await getCpuProviderCooldownRemainingMs('gemini-embeddings:creation')).toBeGreaterThan(
        0,
      )

      releaseUpload.resolve()
      await owned.waitFor(topic.id, 'delay-changed')
      expect(requests.submissions).not.toHaveBeenCalled()
      const delayedTopic = await owned.queue.getJob(topic.id)
      expect(delayedTopic?.data).toEqual({ cursor })
      expect(delayedTopic?.opts.deduplication).toEqual(topic.opts.deduplication)
      const topicCompleted = waitForRealGlideEvent(
        owned.waitFor(topic.id, 'completed'),
        'cooldown topic completion',
      )
      const imageCompleted = waitForRealGlideEvent(
        owned.waitFor(image.id, 'completed'),
        'cooldown image completion',
      )
      await cooldown.expire()
      await cooldown.promote(topic, topicCompleted)
      await cooldown.promote(image, imageCompleted)
      await topicCompleted
      await imageCompleted
      expect(requests.submissions).toHaveBeenCalledTimes(1)
      expect(requests.uploads).toHaveBeenCalledTimes(3)
      expect(await getTestBatchIdByJobName(jobName)).toBeTruthy()
    } finally {
      releaseUpload.resolve()
      restoreHttp()
      await cooldown.close()
    }
  }, 30_000)
})
