import { randomUUID } from 'node:crypto'
import { channel } from 'node:diagnostics_channel'
import { v7 as uuidv7 } from 'uuid'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BedrockControlClient } from '@modules/aws/bedrock-control'
import { S3BedrockBatchClient } from '@modules/aws/s3-bedrock-batch'
import { embeddingCreationLeaseValkeyClient } from '@data-stores/valkey/clients'
import { workerQueueConnection, workerQueuePrefix } from '@data-stores/valkey-core/glide-mq-client'
import { BACKGROUND_CPU_QUEUE_NAME } from '@queues/background-cpu/config'
import { requireBackgroundCpuJob } from '@queues/background-cpu/enqueues/registry'
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
const LEASE_KEY = 'bedrock-embeddings:creation:lease'
const textCursor = {
  sweepStartedAt: '1970-01-01T00:00:02.000Z',
  afterId: uuidv7({ msecs: 1_500 }),
}
const emptyImageCursor = { sweepStartedAt: '1970-01-01T00:00:00.000Z' }
const definition = (type: 'topics' | 'posts' | 'images') =>
  requireBackgroundCpuJob(`bedrock-embeddings.create_${type}`)
describe('embedding creation lease loss through real background CPU workers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('BEDROCK_BATCH_ROLE_ARN', 'arn:aws:iam::123456789012:role/test-bedrock-role')
    vi.stubEnv('ENVIRONMENT', 'staging')
  })
  afterEach(() => vi.unstubAllEnvs())
  it('defers pre-submit loss, then records a Bedrock receipt after in-flight loss', async () => {
    const fixture = await acquireEmbeddingQuotaFixture()
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
    const restore = overrideDynamicConfigFieldsForTest(bedrockEmbeddingsBatchConfig, {
      min_records_per_job: 1,
      max_requests_per_hour: BEDROCK_BATCH_MAX_VALUES.max_requests_per_hour,
      max_inflight_jobs: BEDROCK_BATCH_MAX_VALUES.max_inflight_jobs,
      max_job_size_gb: BEDROCK_BATCH_MAX_VALUES.max_job_size_gb,
      max_scan_rows_per_run: 10_000,
      creation_lease_renewal_interval_ms: 100,
      creation_lease_retry_delay_ms: 1_000,
    })
    const s3Entered = Promise.withResolvers<void>()
    const releaseS3 = Promise.withResolvers<void>()
    owned.releaseOnCleanup(() => releaseS3.resolve())
    vi.mocked(S3BedrockBatchClient.send)
      .mockImplementationOnce(() => {
        s3Entered.resolve()
        return releaseS3.promise as never
      })
      .mockResolvedValue(undefined as never)
    const postArn = `arn:aws:bedrock:us-west-2:123456789012:model-invocation-job/${randomUUID()}`
    const topicArn = `arn:aws:bedrock:us-west-2:123456789012:model-invocation-job/${randomUUID()}`
    const topicSendEntered = Promise.withResolvers<void>()
    const releaseTopicSend = Promise.withResolvers<{ jobArn: string }>()
    owned.releaseOnCleanup(() => releaseTopicSend.resolve({ jobArn: topicArn }))
    vi.mocked(BedrockControlClient.send)
      .mockResolvedValueOnce({ jobArn: postArn } as never)
      .mockImplementationOnce(() => {
        topicSendEntered.resolve()
        return releaseTopicSend.promise as never
      })
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
      const batches = await Promise.all([getBatchIdByJobArn(postArn), getBatchIdByJobArn(topicArn)])
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
            domains: ['bedrock-embeddings'],
            prefix: connection.prefix,
            concurrency: 1,
            blockTimeout: 1_000,
            promotionInterval: 50,
          }),
        ),
        owned.createWorker(() =>
          createBackgroundCpuWorker({
            handlers: BACKGROUND_CPU_HANDLERS,
            domains: ['bedrock-embeddings'],
            prefix: connection.prefix,
            concurrency: 1,
            blockTimeout: 1_000,
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
      await s3Entered.promise
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
      expect(await getBatchIdByJobArn(postArn)).toBeTruthy()
      expect(await firstLoss.promise).toBe('not-owner')
      releaseS3.resolve()
      await owned.waitFor(first.id, 'delay-changed')
      expect(vi.mocked(BedrockControlClient.send)).toHaveBeenCalledTimes(1)
      const storedFirst = await owned.queue.getJob(first.id)
      expect(storedFirst?.data).toEqual({ cursor: textCursor })
      expect(storedFirst?.opts.deduplication).toEqual(first.opts.deduplication)
      const firstCompleted = waitForRealGlideEvent(
        owned.waitFor(first.id, 'completed'),
        'former holder topic completion',
      )
      await owned.promote(first)
      await topicSendEntered.promise
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
      releaseTopicSend.resolve({ jobArn: topicArn })
      await firstCompleted
      expect(vi.mocked(BedrockControlClient.send)).toHaveBeenCalledTimes(2)
      expect(await getBatchIdByJobArn(topicArn)).toBeTruthy()
    } finally {
      losses.unsubscribe(onLoss)
      releaseS3.resolve()
      releaseTopicSend.resolve({ jobArn: topicArn })
      await fixture.close()
    }
  }, 30_000)
})
