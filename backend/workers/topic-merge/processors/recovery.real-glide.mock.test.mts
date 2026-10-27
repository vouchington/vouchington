import { afterEach, describe, expect, it, vi } from 'vitest'
import { workerQueueConnection, workerQueuePrefix } from '@data-stores/valkey-core/glide-mq-client'
import {
  TOPIC_MERGE_PAGE_JOB,
  TOPIC_MERGE_RECOVER_JOB,
  type TopicMergePageData,
  type TopicMergeRecoveryData,
} from '@queues/background/enqueues/topic-merge-jobs'
import { topicMergePageJobId } from '@queues/background/enqueues/topic-merge-enqueues'
import { dispatchStalledTopicMergePage } from '@services/topics/merge-recovery'
import { createTestTopic, createTestUser } from '@voucha/test-helpers'
import {
  createTopicMergeNativeOperation,
  deleteTopicMergeNativeOperation,
  getTopicMergeNativeCheckpoint,
} from '@voucha/test-helpers/topic-merge-native-operation'
import {
  startBackgroundHarness,
  type BackgroundHarness,
} from '@voucha/test-helpers/real-glide-background'
import { uuidBefore } from '@voucha/test-helpers/uuid-before'
import { createBackgroundProcessor } from '../../background/processors.mts'

vi.mock<typeof import('glide-mq')>(import('glide-mq'), importOriginal => importOriginal())

const connection = { connection: workerQueueConnection, prefix: workerQueuePrefix }

describe('topic merge recovery through native GlideMQ', () => {
  let harness: BackgroundHarness | undefined
  let ownedOperationId: string | undefined

  afterEach(async () => {
    await harness?.close()
    harness = undefined
    if (ownedOperationId) await deleteTopicMergeNativeOperation(ownedOperationId)
    ownedOperationId = undefined
  })

  it('uses automatic sweep bounds and leaves a fresh operation queued for its normal page', async () => {
    let result: Awaited<ReturnType<typeof dispatchStalledTopicMergePage>> | undefined
    const enqueueRecovered = async (inputs: TopicMergePageData[]) => {
      if (inputs.some(input => input.operationId !== ownedOperationId))
        throw new Error('Recovery selected an operation outside this test')
      await harness!.queue.addBulk(
        inputs.map(data => ({
          name: TOPIC_MERGE_PAGE_JOB.name,
          data,
          opts: {
            ...TOPIC_MERGE_PAGE_JOB.options,
            jobId: topicMergePageJobId(data),
            delay: 60_000,
          },
        })),
      )
    }
    harness = await startBackgroundHarness({
      connection,
      createProcessor: createBackgroundProcessor,
      bodies: {
        [TOPIC_MERGE_RECOVER_JOB.name]: async job => {
          result = await dispatchStalledTopicMergePage(
            job.data as TopicMergeRecoveryData,
            1,
            enqueueRecovered,
          )
        },
      },
    })

    // Creating the durable operation after native worker readiness keeps it inside the live
    // recovery window; the immediate predecessor cursor makes it the first raw page row.
    const administrator = await createTestUser({ administrator: true })
    const source = await createTestTopic({ user: administrator })
    const destination = await createTestTopic({ user: administrator })
    ownedOperationId = await createTopicMergeNativeOperation(
      source.id,
      destination.id,
      administrator.id,
    )
    const checkpoint = await getTopicMergeNativeCheckpoint(ownedOperationId)
    const jobId = `topic_merge_recovery_healthy_${ownedOperationId}`
    const settled = harness.settled({ id: jobId })
    await harness.add(
      TOPIC_MERGE_RECOVER_JOB,
      { cursorOperationId: uuidBefore(ownedOperationId) },
      { jobId },
    )
    await expect(settled).resolves.toBe('completed')

    expect(result).toMatchObject({
      result: 0,
      next: {
        highWaterId: expect.any(String),
        staleBefore: expect.any(String),
        cursorOperationId: ownedOperationId,
      },
    })
    expect(await getTopicMergeNativeCheckpoint(ownedOperationId)).toEqual(checkpoint)
    expect(
      await harness.queue.getJob(
        topicMergePageJobId({
          operationId: ownedOperationId,
          generation: checkpoint.generation,
        }),
      ),
    ).toBeNull()
    expect(harness.stalledJobIds).toEqual([])
  })
})
