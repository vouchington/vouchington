import { randomUUID } from 'node:crypto'
import { channel } from 'node:diagnostics_channel'
import { v7 as uuidv7 } from 'uuid'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { embeddingCreationLeaseValkeyClient } from '@data-stores/valkey/clients'
import { workerQueueConnection, workerQueuePrefix } from '@data-stores/valkey-core/glide-mq-client'
import { BACKGROUND_CPU_QUEUE_NAME } from '@queues/background-cpu/config'
import { requireBackgroundCpuJob } from '@queues/background-cpu/enqueues/registry'
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
const LEASE_KEY = 'gemini-embeddings:creation:lease'
const textCursor = {
  sweepStartedAt: '1970-01-01T00:00:02.000Z',
  afterId: uuidv7({ msecs: 1_500 }),
}
const emptyImageCursor = { sweepStartedAt: '1970-01-01T00:00:00.000Z' }
const definition = (type: 'topics' | 'posts' | 'images') =>
  requireBackgroundCpuJob(`gemini-embeddings.create_${type}`)
describe('embedding creation lease loss through real background CPU workers', () => {
  let fixture: Awaited<ReturnType<typeof acquireEmbeddingQuotaFixture>>
  beforeEach(async () => {
    vi.clearAllMocks()
    vi.stubEnv('ENVIRONMENT', 'staging')
    fixture = await acquireEmbeddingQuotaFixture()
  })
  afterEach(() => vi.unstubAllEnvs())
  // no-mistakes-timeout-reason: real GlideMQ worker drain for embedding creation lease loss
  it('defers pre-submit loss, then records a Vertex receipt after in-flight loss', async () => {
    const connection = {
      connection: workerQueueConnection,
      prefix: `${workerQueuePrefix}-creation-loss-${randomUUID()}`,
    }
    const owned = createOwnedEmbeddingQueue(
      fixture,
      'live_loss',
      connection,
      BACKGROUND_CPU_QUEUE_NAME,
    )
    const restore = overrideDynamicConfigFieldsForTest(geminiEmbeddingsBatchConfig, {
      min_records_per_job: 1,
      max_requests_per_hour: GEMINI_BATCH_MAX_VALUES.max_requests_per_hour,
      max_inflight_jobs: GEMINI_BATCH_MAX_VALUES.max_inflight_jobs,
      max_job_size_gb: GEMINI_BATCH_MAX_VALUES.max_job_size_gb,
      max_scan_rows_per_run: 10_000,
      creation_lease_renewal_interval_ms: 100,
      creation_lease_retry_delay_ms: 1_000,
    })
    const uploadEntered = Promise.withResolvers<void>()
    const releaseUpload = Promise.withResolvers<void>()
    owned.releaseOnCleanup(() => releaseUpload.resolve())
    const postJobName = `projects/synthetic-project/locations/us/batchPredictionJobs/${randomUUID().replaceAll('-', '')}`
    const topicJobName = `projects/synthetic-project/locations/us/batchPredictionJobs/${randomUUID().replaceAll('-', '')}`
    const topicSubmitEntered = Promise.withResolvers<void>()
    const releaseTopicSubmit = Promise.withResolvers<string>()
    owned.releaseOnCleanup(() => releaseTopicSubmit.resolve(topicJobName))
    let uploadCount = 0
    let submitCount = 0
    const vertex = createVertexHttpFixture()
    const requests = vertex.batchCreationResponses({
      onUpload: async () => {
        if (uploadCount++ === 0) {
          uploadEntered.resolve()
          await releaseUpload.promise
        }
      },
      onSubmit: async () => {
        if (submitCount++ === 0) return postJobName
        if (submitCount === 2) {
          topicSubmitEntered.resolve()
          return releaseTopicSubmit.promise
        }
        return `projects/synthetic-project/locations/us/batchPredictionJobs/${randomUUID().replaceAll('-', '')}`
      },
    })
    const restoreHttp = vertex.activate()
    const user = await createTestUserDirect()
    const topicId = await insertTestTopic({
      id: uuidv7({ msecs: 1_000 }),
      name: `Loss topic ${randomUUID()}`,
      slug: `loss-${randomUUID()}`,
      createdById: user.id,
    })
    const postId = await insertTestPost({
      id: uuidv7({ msecs: 1_000 }),
      title: `Loss post ${randomUUID()}`,
      slug: `loss-${randomUUID()}`,
      markdown: 'Content for the lease loss test.',
      createdById: user.id,
    })
    fixture.beforeRelease(async () => {
      const batches = await Promise.all([
        getTestBatchIdByJobName(postJobName),
        getTestBatchIdByJobName(topicJobName),
      ])
      await cleanupTestEmbeddingsBatches(batches.filter((id): id is string => Boolean(id)))
      await hardDeleteTestPost(postId)
      await hardDeleteTestTopic(topicId)
      await hardDeleteTestUser(user.id)
      restore()
    })
    const losses = channel('voucha.embedding-creation.lease-loss')
    const firstLoss = Promise.withResolvers<string>()
    const secondLoss = Promise.withResolvers<string>()
    let firstJobId: string | undefined
    let lossCount = 0
    const onLoss = (message: unknown) => {
      const event = message as { jobId?: string; reason?: string }
      if (event?.jobId !== firstJobId) return
      const pending = lossCount++ === 0 ? firstLoss : secondLoss
      pending.resolve(event.reason ?? 'unknown')
    }
    losses.subscribe(onLoss)
    try {
      const [workerA, workerB] = await Promise.all([
        owned.createWorker(() =>
          createBackgroundCpuWorker({
            handlers: BACKGROUND_CPU_HANDLERS,
            domains: ['gemini-embeddings'],
            prefix: connection.prefix,
            concurrency: 1,
            blockTimeout: 100,
            promotionInterval: 50,
          }),
        ),
        owned.createWorker(() =>
          createBackgroundCpuWorker({
            handlers: BACKGROUND_CPU_HANDLERS,
            domains: ['gemini-embeddings'],
            prefix: connection.prefix,
            concurrency: 1,
            blockTimeout: 100,
            promotionInterval: 50,
          }),
        ),
      ])
      await Promise.all([owned.ready(), workerA.waitUntilReady(), workerB.waitUntilReady()])
      const firstDefinition = definition('topics')
      const first = await owned.add(
        firstDefinition.name,
        { cursor: textCursor },
        {
          ...firstDefinition.options,
          ...creationJobOptions(randomUUID()),
        },
      )
      if (!first) throw new Error('Expected first creation job')
      firstJobId = first.id
      await uploadEntered.promise
      expect(await embeddingCreationLeaseValkeyClient.pexpire(LEASE_KEY, 0)).toBe(true)
      const postDefinition = definition('posts')
      const post = await owned.add(
        postDefinition.name,
        { cursor: textCursor },
        {
          ...postDefinition.options,
          ...creationJobOptions(randomUUID()),
        },
      )
      if (!post) throw new Error('Expected post creation job')
      await waitForRealGlideEvent(owned.waitFor(post.id, 'completed'), 'successor post completion')
      expect(await getTestBatchIdByJobName(postJobName)).toBeTruthy()
      expect(await firstLoss.promise).toBe('not-owner')
      releaseUpload.resolve()
      await owned.waitFor(first.id, 'delay-changed')
      expect(requests.submissions).toHaveBeenCalledTimes(1)
      const storedFirst = await owned.queue.getJob(first.id)
      expect(storedFirst?.data).toEqual({ cursor: textCursor })
      expect(storedFirst?.opts.deduplication).toEqual(first.opts.deduplication)
      const firstCompleted = waitForRealGlideEvent(
        owned.waitFor(first.id, 'completed'),
        'former holder topic completion',
      )
      await owned.promote(first)
      await topicSubmitEntered.promise
      expect(await embeddingCreationLeaseValkeyClient.pexpire(LEASE_KEY, 0)).toBe(true)
      const imageDefinition = definition('images')
      const image = await owned.add(
        imageDefinition.name,
        { cursor: emptyImageCursor },
        {
          ...imageDefinition.options,
          ...creationJobOptions(randomUUID()),
        },
      )
      if (!image) throw new Error('Expected image creation job')
      await waitForRealGlideEvent(
        owned.waitFor(image.id, 'completed'),
        'successor image completion',
      )
      expect(await secondLoss.promise).toBe('not-owner')
      releaseTopicSubmit.resolve(topicJobName)
      await firstCompleted
      expect(requests.submissions).toHaveBeenCalledTimes(2)
      expect(await getTestBatchIdByJobName(topicJobName)).toBeTruthy()
    } finally {
      losses.unsubscribe(onLoss)
      releaseUpload.resolve()
      releaseTopicSubmit.resolve(topicJobName)
      restoreHttp()
      await fixture.close()
    }
  }, 30_000)
})
