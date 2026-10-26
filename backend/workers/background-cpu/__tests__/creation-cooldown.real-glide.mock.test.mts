import { randomUUID } from 'node:crypto'
import { v7 as uuidv7 } from 'uuid'
import { CreateModelInvocationJobCommand } from '@aws-sdk/client-bedrock'
import { Worker } from 'glide-mq'
import { throwRateLimited } from '@vouchington/queue-errors'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BedrockControlClient } from '@modules/aws/bedrock-control'
import { S3BedrockBatchClient } from '@modules/aws/s3-bedrock-batch'
import { workerQueueConnection, workerQueuePrefix } from '@data-stores/valkey-core/glide-mq-client'
import { BACKGROUND_CPU_QUEUE_NAME } from '@queues/background-cpu/config'
import { requireBackgroundCpuJob } from '@queues/background-cpu/enqueues/registry'
import { creationJobOptions } from '@queues/bedrock-embeddings-batch/enqueues'
import {
  BEDROCK_BATCH_MAX_VALUES,
  bedrockEmbeddingsBatchConfig,
} from '@services/bedrock-embeddings/batch/config'
import { getBatchIdByJobArn } from '@services/bedrock-embeddings/batch/orchestrator/poll-queries'
import { getCpuProviderCooldownRemainingMs } from '@services/bedrock-embeddings/provider-cooldown'
import { acquireEmbeddingQuotaFixture } from '@voucha/test-helpers/embedding-creation-quota'
import { createOwnedEmbeddingQueue } from '@voucha/test-helpers/embedding-creation-events'
import { waitForRealGlideEvent } from '@voucha/test-helpers/real-glide-terminal-deadline'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { cleanupTestEmbeddingsBatches } from '@voucha/test-helpers/entities/bedrock-embeddings-batches'
import {
  createTestUserDirect,
  hardDeleteTestTopic,
  hardDeleteTestUser,
  insertTestTopic,
} from '@voucha/test-helpers'
import { BACKGROUND_CPU_HANDLERS } from '../processors/handlers.mts'
import { createBackgroundCpuWorker } from '../workers/create-worker.mts'

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

describe('creation admission on real GlideMQ', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('rechecks shared cooldown after S3 upload before submitting a creation batch', async () => {
    vi.stubEnv('BEDROCK_BATCH_ROLE_ARN', 'arn:aws:iam::123456789012:role/test-bedrock-role')
    vi.stubEnv('ENVIRONMENT', 'staging')
    const fixture = await acquireEmbeddingQuotaFixture()
    const owned = createOwnedEmbeddingQueue(
      fixture,
      'cooldown_during_upload',
      {
        connection: workerQueueConnection,
        prefix: `${workerQueuePrefix}-creation-cooldown-${randomUUID()}`,
      },
      BACKGROUND_CPU_QUEUE_NAME,
    )
    const restore = overrideDynamicConfigFieldsForTest(bedrockEmbeddingsBatchConfig, {
      min_records_per_job: 1,
      max_requests_per_hour: BEDROCK_BATCH_MAX_VALUES.max_requests_per_hour,
      max_inflight_jobs: BEDROCK_BATCH_MAX_VALUES.max_inflight_jobs,
      max_job_size_gb: BEDROCK_BATCH_MAX_VALUES.max_job_size_gb,
      max_scan_rows_per_run: 10_000,
    })
    const user = await createTestUserDirect()
    const topicId = await insertTestTopic({
      id: uuidv7({ msecs: 1_000 }),
      name: `Cooldown topic ${randomUUID()}`,
      slug: `cooldown-${randomUUID()}`,
      createdById: user.id,
    })
    const jobArn = `arn:aws:bedrock:us-west-2:123456789012:model-invocation-job/${randomUUID()}`
    const uploadEntered = Promise.withResolvers<void>()
    const releaseUpload = Promise.withResolvers<void>()
    owned.releaseOnCleanup(() => releaseUpload.resolve())
    vi.mocked(S3BedrockBatchClient.send)
      .mockImplementationOnce(() => {
        uploadEntered.resolve()
        return releaseUpload.promise as never
      })
      .mockResolvedValue(undefined as never)
    vi.mocked(BedrockControlClient.send).mockResolvedValue({ jobArn } as never)
    fixture.beforeRelease(async () => {
      const batchId = await getBatchIdByJobArn(jobArn)
      if (batchId) await cleanupTestEmbeddingsBatches([batchId])
      await hardDeleteTestTopic(topicId)
      await hardDeleteTestUser(user.id)
      restore()
    })
    try {
      const topicDefinition = requireBackgroundCpuJob('bedrock-embeddings.create_topics')
      const imageDefinition = requireBackgroundCpuJob('bedrock-embeddings.create_images')
      let imageAttempts = 0
      const handlers = BACKGROUND_CPU_HANDLERS.map(handler =>
        handler.job.name === imageDefinition.name
          ? {
              ...handler,
              handle: () => {
                imageAttempts += 1
                if (imageAttempts === 1)
                  throwRateLimited(3_000, new Error('Bedrock throttled'), {
                    RateLimitError: Worker.RateLimitError,
                  })
              },
            }
          : handler,
      )
      const firstWorker = await owned.createWorker(() =>
        createBackgroundCpuWorker({
          handlers,
          domains: ['bedrock-embeddings'],
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
          domains: ['bedrock-embeddings'],
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
      expect(
        await getCpuProviderCooldownRemainingMs('bedrock-embeddings:creation'),
      ).toBeGreaterThan(0)

      releaseUpload.resolve()
      await owned.waitFor(topic.id, 'delay-changed')
      expect(vi.mocked(BedrockControlClient.send)).not.toHaveBeenCalled()
      const delayedTopic = await owned.queue.getJob(topic.id)
      expect(delayedTopic?.data).toEqual({ cursor })
      expect(delayedTopic?.opts.deduplication).toEqual(topic.opts.deduplication)
      await waitForRealGlideEvent(owned.waitFor(topic.id, 'completed'), 'cooldown topic completion')
      await waitForRealGlideEvent(owned.waitFor(image.id, 'completed'), 'cooldown image completion')
      expect(vi.mocked(BedrockControlClient.send)).toHaveBeenCalledExactlyOnceWith(
        expect.any(CreateModelInvocationJobCommand),
      )
      expect(await getBatchIdByJobArn(jobArn)).toBeTruthy()
    } finally {
      releaseUpload.resolve()
      await fixture.close()
    }
  }, 30_000)
})
