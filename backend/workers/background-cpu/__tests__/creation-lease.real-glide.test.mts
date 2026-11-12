import { randomUUID } from 'node:crypto'
import { v7 as uuidv7 } from 'uuid'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { workerQueueConnection, workerQueuePrefix } from '@data-stores/valkey-core/glide-mq-client'
import { requireBackgroundCpuJob } from '@queues/background-cpu/enqueues/registry'
import { BACKGROUND_CPU_QUEUE_NAME } from '@queues/background-cpu/config'
import { creationJobOptions } from '@queues/gemini-embeddings-batch/enqueues'
import {
  GEMINI_BATCH_MAX_VALUES,
  geminiEmbeddingsBatchConfig,
} from '@services/embeddings/batch/config'
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
  hardDeleteTestPost,
  hardDeleteTestTopic,
  hardDeleteTestUser,
  insertTestPost,
  insertTestTopic,
} from '@voucha/test-helpers'
import { createBackgroundCpuWorker } from '../workers/create-worker.mts'
import { BACKGROUND_CPU_HANDLERS } from '../processors/handlers.mts'
import { createVertexHttpFixture } from '@voucha/test-helpers/vertex-http'

const connection = {
  connection: workerQueueConnection,
  prefix: `${workerQueuePrefix}-creation-lease-${randomUUID()}`,
}
const definition = (type: 'topics' | 'posts' | 'images') =>
  requireBackgroundCpuJob(`gemini-embeddings.create_${type}`)
const ownedTextCursor = {
  sweepStartedAt: '1970-01-01T00:00:02.000Z',
  afterId: uuidv7({ msecs: 1_500 }),
}

describe('production embedding creation on real GlideMQ', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('ENVIRONMENT', 'staging')
  })
  afterEach(() => vi.unstubAllEnvs())

  it('runs ready text before a quota-delayed image retry with the same image identity', async () => {
    const fixture = await acquireEmbeddingQuotaFixture()
    const vertex = createVertexHttpFixture()
    const requests = vertex.batchCreationResponses()
    const restoreHttp = vertex.activate()
    const owned = createOwnedEmbeddingQueue(
      fixture,
      'quota_fairness',
      connection,
      BACKGROUND_CPU_QUEUE_NAME,
    )
    const restore = overrideDynamicConfigFieldsForTest(geminiEmbeddingsBatchConfig, {
      min_records_per_job: 1,
      max_requests_per_hour: GEMINI_BATCH_MAX_VALUES.max_requests_per_hour,
      max_inflight_jobs: GEMINI_BATCH_MAX_VALUES.max_inflight_jobs,
      max_job_size_gb: 100,
      max_scan_rows_per_run: 2,
      creation_retry_delay_ms: 30_000,
    })
    const user = await createTestUserDirect()
    let topicId: string | undefined
    const jobName = `projects/synthetic-project/locations/us/batchPredictionJobs/${randomUUID().replaceAll('-', '')}`
    fixture.beforeRelease(async () => {
      const batchId = await getTestBatchIdByJobName(jobName)
      if (batchId) await cleanupTestEmbeddingsBatches([batchId])
      if (topicId) await hardDeleteTestTopic(topicId)
      await hardDeleteTestUser(user.id)
      restore()
    })
    try {
      const imageDefinition = definition('images')
      const topicDefinition = definition('topics')
      const worker = await owned.createWorker(() =>
        createBackgroundCpuWorker({
          handlers: BACKGROUND_CPU_HANDLERS,
          domains: ['gemini-embeddings'],
          prefix: connection.prefix,
          concurrency: 2,
          blockTimeout: 1_000,
          promotionInterval: 50,
        }),
      )
      await Promise.all([owned.ready(), worker.waitUntilReady()])
      await fixture.insertActiveSizeControl(100 * 1_024)
      const cursor = { sweepStartedAt: '1970-01-01T00:00:00.000Z' }
      const image = await owned.add(
        imageDefinition.name,
        { cursor },
        { ...imageDefinition.options, ...creationJobOptions(randomUUID()) },
      )
      if (!image) throw new Error('Expected image job')
      await owned.waitFor(image.id, 'delay-changed')
      const delayed = await owned.queue.getJob(image.id)
      expect(delayed?.data).toEqual({ cursor })
      expect(delayed?.opts.deduplication).toEqual(image.opts.deduplication)
      expect(await delayed?.getState()).toBe('delayed')

      await fixture.removeOwnedReservations()
      topicId = await insertTestTopic({
        id: uuidv7({ msecs: 1_000 }),
        name: `Lease topic ${randomUUID()}`,
        slug: `lease-${randomUUID()}`,
        createdById: user.id,
      })
      const topic = await owned.add(
        topicDefinition.name,
        { cursor: ownedTextCursor },
        { ...topicDefinition.options, ...creationJobOptions(randomUUID()) },
      )
      if (!topic) throw new Error('Expected topic job')
      await waitForRealGlideEvent(owned.waitFor(topic.id, 'completed'), 'fairness topic completion')
      expect(requests.submissions).toHaveBeenCalledTimes(1)
      expect(requests.uploads).toHaveBeenCalledTimes(2)
      expect(await getTestBatchIdByJobName(jobName)).toBeTruthy()
      expect(await delayed?.getState()).toBe('delayed')
      const completedImage = waitForRealGlideEvent(
        owned.waitFor(image.id, 'completed'),
        'fairness image retry completion',
      )
      await owned.promote(image)
      await completedImage
      expect((await owned.queue.getJob(image.id))?.data).toEqual({ cursor })
    } finally {
      restoreHttp()
      await fixture.close()
    }
  })

  it('keeps two workers to one active creation and retries the contending job unchanged', async () => {
    const fixture = await acquireEmbeddingQuotaFixture()
    const owned = createOwnedEmbeddingQueue(
      fixture,
      'two_workers',
      { ...connection, prefix: `${connection.prefix}-${randomUUID()}` },
      BACKGROUND_CPU_QUEUE_NAME,
    )
    const restore = overrideDynamicConfigFieldsForTest(geminiEmbeddingsBatchConfig, {
      min_records_per_job: 1,
      max_requests_per_hour: GEMINI_BATCH_MAX_VALUES.max_requests_per_hour,
      max_inflight_jobs: GEMINI_BATCH_MAX_VALUES.max_inflight_jobs,
      max_job_size_gb: GEMINI_BATCH_MAX_VALUES.max_job_size_gb,
      max_scan_rows_per_run: 10_000,
      creation_lease_retry_delay_ms: 1_000,
    })
    const firstJobName = `projects/synthetic-project/locations/us/batchPredictionJobs/${randomUUID().replaceAll('-', '')}`
    const secondJobName = `projects/synthetic-project/locations/us/batchPredictionJobs/${randomUUID().replaceAll('-', '')}`
    const firstSendEntered = Promise.withResolvers<void>()
    const releaseFirstSend = Promise.withResolvers<string>()
    owned.releaseOnCleanup(() => releaseFirstSend.resolve(firstJobName))
    const vertex = createVertexHttpFixture()
    let submitCount = 0
    const requests = vertex.batchCreationResponses({
      onSubmit: async () => {
        if (submitCount++ === 0) {
          firstSendEntered.resolve()
          return releaseFirstSend.promise
        }
        return secondJobName
      },
    })
    const restoreHttp = vertex.activate()
    const user = await createTestUserDirect()
    const topicId = await insertTestTopic({
      id: uuidv7({ msecs: 1_000 }),
      name: `Cap topic ${randomUUID()}`,
      slug: `cap-${randomUUID()}`,
      createdById: user.id,
    })
    const postId = await insertTestPost({
      id: uuidv7({ msecs: 1_000 }),
      title: `Cap post ${randomUUID()}`,
      slug: `cap-${randomUUID()}`,
      markdown: 'Content for the cross-type creation lease test.',
      createdById: user.id,
    })
    fixture.beforeRelease(async () => {
      const batches = await Promise.all([
        getTestBatchIdByJobName(firstJobName),
        getTestBatchIdByJobName(secondJobName),
      ])
      await cleanupTestEmbeddingsBatches(batches.filter((id): id is string => Boolean(id)))
      await hardDeleteTestPost(postId)
      await hardDeleteTestTopic(topicId)
      await hardDeleteTestUser(user.id)
      restore()
    })
    try {
      const [firstWorker, secondWorker] = await Promise.all([
        owned.createWorker(() =>
          createBackgroundCpuWorker({
            handlers: BACKGROUND_CPU_HANDLERS,
            domains: ['gemini-embeddings'],
            prefix: owned.options.prefix,
            concurrency: 1,
            blockTimeout: 1_000,
            promotionInterval: 50,
          }),
        ),
        owned.createWorker(() =>
          createBackgroundCpuWorker({
            handlers: BACKGROUND_CPU_HANDLERS,
            domains: ['gemini-embeddings'],
            prefix: owned.options.prefix,
            concurrency: 1,
            blockTimeout: 1_000,
            promotionInterval: 50,
          }),
        ),
      ])
      await Promise.all([
        owned.ready(),
        firstWorker.waitUntilReady(),
        secondWorker.waitUntilReady(),
      ])
      const firstDefinition = definition('topics')
      const first = await owned.add(
        firstDefinition.name,
        { cursor: ownedTextCursor },
        { ...firstDefinition.options, ...creationJobOptions(randomUUID()) },
      )
      if (!first) throw new Error('Expected first creation job')
      await firstSendEntered.promise
      const cursor = ownedTextCursor
      const secondDefinition = definition('posts')
      const second = await owned.add(
        secondDefinition.name,
        { cursor },
        { ...secondDefinition.options, ...creationJobOptions(randomUUID()) },
      )
      if (!second) throw new Error('Expected second creation job')
      await owned.waitFor(second.id, 'delay-changed')
      expect(requests.submissions).toHaveBeenCalledTimes(1)
      expect(requests.uploads).toHaveBeenCalledTimes(2)
      const storedSecond = await owned.queue.getJob(second.id)
      expect(await storedSecond?.getState()).toBe('delayed')
      expect(storedSecond?.data).toEqual({ cursor })
      expect(storedSecond?.opts.deduplication).toEqual(second.opts.deduplication)
      releaseFirstSend.resolve(firstJobName)
      await waitForRealGlideEvent(
        owned.waitFor(first.id, 'completed'),
        'first worker batch completion',
      )
      expect(await getTestBatchIdByJobName(firstJobName)).toBeTruthy()
      const secondCompleted = waitForRealGlideEvent(
        owned.waitFor(second.id, 'completed'),
        'second worker batch completion',
      )
      await owned.promote(second)
      await secondCompleted
      expect(requests.submissions).toHaveBeenCalledTimes(2)
      expect(await getTestBatchIdByJobName(secondJobName)).toBeTruthy()
    } finally {
      releaseFirstSend.resolve(firstJobName)
      restoreHttp()
      await fixture.close()
    }
  })
})
