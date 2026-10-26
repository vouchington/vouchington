import { randomUUID } from 'node:crypto'
import { v7 as uuidv7 } from 'uuid'
import { CreateModelInvocationJobCommand } from '@aws-sdk/client-bedrock'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BedrockControlClient } from '@modules/aws/bedrock-control'
import { S3BedrockBatchClient } from '@modules/aws/s3-bedrock-batch'
import { workerQueueConnection, workerQueuePrefix } from '@data-stores/valkey-core/glide-mq-client'
import { requireBackgroundCpuJob } from '@queues/background-cpu/enqueues/registry'
import { BACKGROUND_CPU_QUEUE_NAME } from '@queues/background-cpu/config'
import { creationJobOptions } from '@queues/bedrock-embeddings-batch/enqueues'
import {
  BEDROCK_BATCH_MAX_VALUES,
  bedrockEmbeddingsBatchConfig,
} from '@services/bedrock-embeddings/batch/config'
import { getBatchIdByJobArn } from '@services/bedrock-embeddings/batch/orchestrator/poll-queries'
import { acquireEmbeddingQuotaFixture } from '@voucha/test-helpers/embedding-creation-quota'
import { createOwnedEmbeddingQueue } from '@voucha/test-helpers/embedding-creation-events'
import { waitForRealGlideEvent } from '@voucha/test-helpers/real-glide-terminal-deadline'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { cleanupTestEmbeddingsBatches } from '@voucha/test-helpers/entities/bedrock-embeddings-batches'
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

vi.mock<typeof import('@modules/aws/s3-bedrock-batch')>(
  import('@modules/aws/s3-bedrock-batch'),
  async importOriginal => ({
    ...(await importOriginal<typeof import('@modules/aws/s3-bedrock-batch')>()),
    S3BedrockBatchClient: {
      send: vi.fn<VitestLooseMock>(),
    } as unknown as typeof S3BedrockBatchClient,
  }),
)
vi.mock<typeof import('@modules/aws/bedrock-control')>(
  import('@modules/aws/bedrock-control'),
  async importOriginal => ({
    ...(await importOriginal<typeof import('@modules/aws/bedrock-control')>()),
    BedrockControlClient: {
      send: vi.fn<VitestLooseMock>(),
    } as unknown as typeof BedrockControlClient,
  }),
)

const connection = {
  connection: workerQueueConnection,
  prefix: `${workerQueuePrefix}-creation-lease-${randomUUID()}`,
}
const definition = (type: 'topics' | 'posts' | 'images') =>
  requireBackgroundCpuJob(`bedrock-embeddings.create_${type}`)
const ownedTextCursor = {
  sweepStartedAt: '1970-01-01T00:00:02.000Z',
  afterId: uuidv7({ msecs: 1_500 }),
}

describe('production embedding creation on real GlideMQ', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('BEDROCK_BATCH_ROLE_ARN', 'arn:aws:iam::123456789012:role/test-bedrock-role')
    vi.stubEnv('ENVIRONMENT', 'staging')
    vi.mocked(S3BedrockBatchClient.send).mockResolvedValue(undefined as never)
  })
  afterEach(() => vi.unstubAllEnvs())

  it('runs ready text before a quota-delayed image retry with the same image identity', async () => {
    const fixture = await acquireEmbeddingQuotaFixture()
    const owned = createOwnedEmbeddingQueue(
      fixture,
      'quota_fairness',
      connection,
      BACKGROUND_CPU_QUEUE_NAME,
    )
    const restore = overrideDynamicConfigFieldsForTest(bedrockEmbeddingsBatchConfig, {
      min_records_per_job: 1,
      max_requests_per_hour: BEDROCK_BATCH_MAX_VALUES.max_requests_per_hour,
      max_job_size_gb: 100,
      max_scan_rows_per_run: 2,
      creation_retry_delay_ms: 30_000,
    })
    const user = await createTestUserDirect()
    let topicId: string | undefined
    const jobArn = `arn:aws:bedrock:us-west-2:123456789012:model-invocation-job/${randomUUID()}`
    fixture.beforeRelease(async () => {
      const batchId = await getBatchIdByJobArn(jobArn)
      if (batchId) await cleanupTestEmbeddingsBatches([batchId])
      if (topicId) await hardDeleteTestTopic(topicId)
      await hardDeleteTestUser(user.id)
      restore()
    })
    vi.mocked(BedrockControlClient.send).mockResolvedValue({ jobArn } as never)
    try {
      const imageDefinition = definition('images')
      const topicDefinition = definition('topics')
      const worker = await owned.createWorker(() =>
        createBackgroundCpuWorker({
          handlers: BACKGROUND_CPU_HANDLERS,
          domains: ['bedrock-embeddings'],
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
      expect(vi.mocked(BedrockControlClient.send)).toHaveBeenCalledExactlyOnceWith(
        expect.any(CreateModelInvocationJobCommand),
      )
      expect(await getBatchIdByJobArn(jobArn)).toBeTruthy()
      expect(await delayed?.getState()).toBe('delayed')
      const completedImage = waitForRealGlideEvent(
        owned.waitFor(image.id, 'completed'),
        'fairness image retry completion',
      )
      await owned.promote(image)
      await completedImage
      expect((await owned.queue.getJob(image.id))?.data).toEqual({ cursor })
    } finally {
      await fixture.close()
    }
  }, 30_000)

  it('keeps two workers to one active creation and retries the contending job unchanged', async () => {
    const fixture = await acquireEmbeddingQuotaFixture()
    const owned = createOwnedEmbeddingQueue(
      fixture,
      'two_workers',
      { ...connection, prefix: `${connection.prefix}-${randomUUID()}` },
      BACKGROUND_CPU_QUEUE_NAME,
    )
    const restore = overrideDynamicConfigFieldsForTest(bedrockEmbeddingsBatchConfig, {
      min_records_per_job: 1,
      max_requests_per_hour: BEDROCK_BATCH_MAX_VALUES.max_requests_per_hour,
      max_scan_rows_per_run: 10_000,
      creation_lease_retry_delay_ms: 1_000,
    })
    const firstArn = `arn:aws:bedrock:us-west-2:123456789012:model-invocation-job/${randomUUID()}`
    const secondArn = `arn:aws:bedrock:us-west-2:123456789012:model-invocation-job/${randomUUID()}`
    const firstSendEntered = Promise.withResolvers<void>()
    const releaseFirstSend = Promise.withResolvers<{ jobArn: string }>()
    owned.releaseOnCleanup(() => releaseFirstSend.resolve({ jobArn: firstArn }))
    vi.mocked(BedrockControlClient.send)
      .mockImplementationOnce(() => {
        firstSendEntered.resolve()
        return releaseFirstSend.promise as never
      })
      .mockResolvedValue({ jobArn: secondArn } as never)
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
        getBatchIdByJobArn(firstArn),
        getBatchIdByJobArn(secondArn),
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
            domains: ['bedrock-embeddings'],
            prefix: owned.options.prefix,
            concurrency: 1,
            blockTimeout: 1_000,
            promotionInterval: 50,
          }),
        ),
        owned.createWorker(() =>
          createBackgroundCpuWorker({
            handlers: BACKGROUND_CPU_HANDLERS,
            domains: ['bedrock-embeddings'],
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
      expect(vi.mocked(BedrockControlClient.send)).toHaveBeenCalledTimes(1)
      expect(vi.mocked(S3BedrockBatchClient.send)).toHaveBeenCalledTimes(1)
      const storedSecond = await owned.queue.getJob(second.id)
      expect(await storedSecond?.getState()).toBe('delayed')
      expect(storedSecond?.data).toEqual({ cursor })
      expect(storedSecond?.opts.deduplication).toEqual(second.opts.deduplication)
      releaseFirstSend.resolve({ jobArn: firstArn })
      await waitForRealGlideEvent(
        owned.waitFor(first.id, 'completed'),
        'first worker batch completion',
      )
      expect(await getBatchIdByJobArn(firstArn)).toBeTruthy()
      const secondCompleted = waitForRealGlideEvent(
        owned.waitFor(second.id, 'completed'),
        'second worker batch completion',
      )
      await owned.promote(second)
      await secondCompleted
      expect(vi.mocked(BedrockControlClient.send)).toHaveBeenCalledTimes(2)
      expect(await getBatchIdByJobArn(secondArn)).toBeTruthy()
    } finally {
      releaseFirstSend.resolve({ jobArn: firstArn })
      await fixture.close()
    }
  }, 30_000)
})
