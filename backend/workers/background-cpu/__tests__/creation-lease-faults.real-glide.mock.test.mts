import { sentryCaptureExceptionMock } from '@voucha/test-helpers/vitest.setup.sentry-mock'
import { randomInt, randomUUID } from 'node:crypto'
import { channel } from 'node:diagnostics_channel'
import { v7 as uuidv7 } from 'uuid'
import { describe, expect, it, vi } from 'vitest'
import {
  acquireRenewableLease,
  type RenewableLease,
  type RenewableLeaseLoss,
} from 'valkyries/lease'
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
import { createBackgroundCpuWorker } from '../workers/create-worker.mts'
import { BACKGROUND_CPU_HANDLERS } from '../processors/handlers.mts'

vi.mock<typeof import('valkyries/lease')>(import('valkyries/lease'), async original => ({
  ...(await original()),
  acquireRenewableLease: vi.fn<VitestLooseMock>() as unknown as typeof acquireRenewableLease,
}))
vi.mock<typeof import('@modules/aws/s3-bedrock-batch')>(
  import('@modules/aws/s3-bedrock-batch'),
  async original => ({
    ...(await original()),
    S3BedrockBatchClient: {
      send: vi.fn<VitestLooseMock>(),
    } as unknown as typeof S3BedrockBatchClient,
  }),
)
vi.mock<typeof import('@modules/aws/bedrock-control')>(
  import('@modules/aws/bedrock-control'),
  async original => ({
    ...(await original()),
    BedrockControlClient: {
      send: vi.fn<VitestLooseMock>(),
    } as unknown as typeof BedrockControlClient,
  }),
)

describe('creation lease consumer fault policy through real background CPU workers', () => {
  it('records an in-flight receipt after renewal loss and preserves a provider error over release failure', async () => {
    vi.stubEnv('BEDROCK_BATCH_ROLE_ARN', 'arn:aws:iam::123456789012:role/test-bedrock-role')
    vi.stubEnv('ENVIRONMENT', 'staging')
    const capture = sentryCaptureExceptionMock
    const fixture = await acquireEmbeddingQuotaFixture()
    const connection = {
      connection: workerQueueConnection,
      prefix: `${workerQueuePrefix}-creation-faults-${randomUUID()}`,
    }
    const owned = createOwnedEmbeddingQueue(
      fixture,
      'faults',
      connection,
      BACKGROUND_CPU_QUEUE_NAME,
    )
    const restore = overrideDynamicConfigFieldsForTest(bedrockEmbeddingsBatchConfig, {
      min_records_per_job: 1,
      max_requests_per_hour: BEDROCK_BATCH_MAX_VALUES.max_requests_per_hour,
      max_inflight_jobs: BEDROCK_BATCH_MAX_VALUES.max_inflight_jobs,
      max_job_size_gb: BEDROCK_BATCH_MAX_VALUES.max_job_size_gb,
      max_scan_rows_per_run: 1,
    })
    const user = await createTestUserDirect()
    const topicIds: string[] = []
    const firstArn = `arn:aws:bedrock:us-west-2:123456789012:model-invocation-job/${randomUUID()}`
    fixture.beforeRelease(async () => {
      const batchId = await getBatchIdByJobArn(firstArn)
      if (batchId) await cleanupTestEmbeddingsBatches([batchId])
      for (const id of topicIds) await hardDeleteTestTopic(id)
      await hardDeleteTestUser(user.id)
      restore()
    })
    const firstLost = Promise.withResolvers<RenewableLeaseLoss>()
    let firstHeld = true
    const firstRelease = vi.fn<RenewableLease['release']>(async () => true)
    const firstLease: RenewableLease = {
      get isHeld() {
        return firstHeld
      },
      lost: firstLost.promise,
      release: firstRelease,
    }
    const secondary = new Error('lease release transport failed')
    const secondRelease = vi.fn<RenewableLease['release']>(async (): Promise<boolean> => {
      throw secondary
    })
    const secondLease: RenewableLease = {
      isHeld: true,
      lost: Promise.withResolvers<RenewableLeaseLoss>().promise,
      release: secondRelease,
    }
    vi.mocked(acquireRenewableLease)
      .mockResolvedValueOnce(firstLease)
      .mockResolvedValueOnce(secondLease)
    const providerEntered = Promise.withResolvers<void>()
    const finishProvider = Promise.withResolvers<{ jobArn: string }>()
    owned.releaseOnCleanup(() => finishProvider.resolve({ jobArn: firstArn }))
    vi.mocked(S3BedrockBatchClient.send).mockResolvedValueOnce(undefined as never)
    const primary = new Error('Bedrock input upload failed')
    vi.mocked(S3BedrockBatchClient.send).mockRejectedValueOnce(primary)
    vi.mocked(BedrockControlClient.send).mockImplementationOnce(() => {
      providerEntered.resolve()
      return finishProvider.promise as never
    })
    const losses = channel('voucha.embedding-creation.lease-loss')
    const reportedLoss = Promise.withResolvers<{ jobId: string; reason: string }>()
    let firstJobId: string | undefined
    const onLoss = (message: unknown) => {
      const event = message as { jobId: string; reason: string }
      if (event.jobId === firstJobId) reportedLoss.resolve(event)
    }
    losses.subscribe(onLoss)
    try {
      const worker = await owned.createWorker(() =>
        createBackgroundCpuWorker({
          handlers: BACKGROUND_CPU_HANDLERS,
          domains: ['bedrock-embeddings'],
          prefix: connection.prefix,
          concurrency: 1,
          blockTimeout: 1_000,
          promotionInterval: 50,
        }),
      )
      await Promise.all([owned.ready(), worker.waitUntilReady()])
      const baseMs = randomInt(1_000_000_000, 2_000_000_000)
      const definition = requireBackgroundCpuJob('bedrock-embeddings.create_topics')
      const firstTopicId = await insertTestTopic({
        id: uuidv7({ msecs: baseMs }),
        name: `Lease fault first ${randomUUID()}`,
        slug: `lease-fault-${randomUUID()}`,
        createdById: user.id,
      })
      topicIds.push(firstTopicId)
      const first = await owned.add(
        definition.name,
        {
          cursor: {
            afterId: uuidv7({ msecs: baseMs + 500 }),
            sweepStartedAt: new Date(baseMs + 1_000).toISOString(),
          },
        },
        { ...definition.options, ...creationJobOptions(randomUUID()), attempts: 1 },
      )
      if (!first) throw new Error('Expected first creation job')
      firstJobId = first.id
      await providerEntered.promise
      firstHeld = false
      const renewalError = new Error('lease renewal transport failed')
      firstLost.resolve({ reason: 'renewal-error', error: renewalError })
      expect(await reportedLoss.promise).toMatchObject({
        jobId: first.id,
        jobType: 'topics',
        reason: 'renewal-error',
      })
      expect(
        capture.mock.calls.some(([err]) => err instanceof Error && err.cause === renewalError),
      ).toBe(true)
      const firstCompleted = waitForRealGlideEvent(
        owned.waitFor(first.id, 'completed'),
        'renewal-loss receipt completion',
      )
      finishProvider.resolve({ jobArn: firstArn })
      await firstCompleted
      expect(await getBatchIdByJobArn(firstArn)).toBeTruthy()
      expect(firstRelease).toHaveBeenCalledTimes(1)

      capture.mockClear()
      const secondTopicId = await insertTestTopic({
        id: uuidv7({ msecs: baseMs + 2_000 }),
        name: `Lease fault second ${randomUUID()}`,
        slug: `lease-fault-${randomUUID()}`,
        createdById: user.id,
      })
      topicIds.push(secondTopicId)
      const second = await owned.add(
        definition.name,
        {
          cursor: {
            afterId: uuidv7({ msecs: baseMs + 2_500 }),
            sweepStartedAt: new Date(baseMs + 3_000).toISOString(),
          },
        },
        { ...definition.options, ...creationJobOptions(randomUUID()), attempts: 1 },
      )
      if (!second) throw new Error('Expected second creation job')
      await waitForRealGlideEvent(
        owned.waitFor(second.id, 'failed'),
        'provider and release failure',
      )
      const stored = await owned.queue.getJob(second.id)
      expect(await stored?.getState()).toBe('failed')
      expect(stored?.failedReason).toContain(primary.message)
      expect(secondRelease).toHaveBeenCalledTimes(1)
      expect(capture.mock.calls.some(([err]) => err === secondary)).toBe(true)
    } finally {
      losses.unsubscribe(onLoss)
      await fixture.close()
      vi.unstubAllEnvs()
    }
  })
})
