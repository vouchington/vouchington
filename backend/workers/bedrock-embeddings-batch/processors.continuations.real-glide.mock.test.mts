import { randomUUID } from 'node:crypto'
import type { Job } from 'glide-mq'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { BedrockControlClient } from '@modules/aws/bedrock-control'
import { getMinUUIDv7ForDate } from '../../modules/utils/ids.mts'
import { backgroundCpu } from '../../queues/background-cpu/queues.mts'
import { bedrockEmbeddingsBatchConfig } from '@services/bedrock-embeddings/batch/config'
import {
  cleanupTestEmbeddingsBatches,
  getTestBatchSummary,
  insertTestEmbeddingsBatch,
} from '@voucha/test-helpers/entities/bedrock-embeddings-batches'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { processBatchPollingDispatcher, processStaleCleanupDispatcher } from './processors.mts'
import { processBedrockEmbeddingsBatchJob } from './processors/worker-router.mts'

vi.mock<typeof import('glide-mq')>(import('glide-mq'), importOriginal => importOriginal())
vi.mock<typeof import('@modules/aws/bedrock-control')>(
  import('@modules/aws/bedrock-control'),
  async importOriginal => ({
    ...(await importOriginal()),
    BedrockControlClient: {
      send: vi.fn<VitestLooseMock>(),
    } as unknown as typeof import('@modules/aws/bedrock-control').BedrockControlClient,
  }),
)

describe('bounded Bedrock batch dispatcher continuations', () => {
  it('polls a capped page and resumes the persisted cursor without crossing its upper bound', async () => {
    onTestFinished(
      overrideDynamicConfigFieldsForTest(bedrockEmbeddingsBatchConfig, {
        batch_listing_page_size: 1,
      }),
    )
    const timestamp = Date.UTC(2400, 0, 1) + parseInt(randomUUID().slice(0, 8), 16)
    const ids = [0, 1, 2].map(offset => getMinUUIDv7ForDate(new Date(timestamp + offset)))
    const cursor = {
      afterId: getMinUUIDv7ForDate(new Date(timestamp - 1)),
      throughId: ids[2]!,
    }
    const continuationId = `bedrock-embeddings__poll_dispatcher__${cursor.throughId}__${ids[0]}`
    const terminalContinuationId = `bedrock-embeddings__poll_dispatcher__${cursor.throughId}__${ids[1]}`
    onTestFinished(async () => {
      for (const id of ids) {
        const jobs = await backgroundCpu.searchJobs({
          name: 'bedrock-embeddings.poll_batch',
          data: { batch_id: id },
        })
        await Promise.all(jobs.map(job => job.remove()))
      }
      await (await backgroundCpu.getJob(continuationId))?.remove()
      await (await backgroundCpu.getJob(terminalContinuationId))?.remove()
      await cleanupTestEmbeddingsBatches(ids)
    })
    await Promise.all(ids.map(id => insertTestEmbeddingsBatch({ id })))

    await expect(processBatchPollingDispatcher(cursor)).resolves.toEqual({
      count: 1,
      hasMore: true,
    })
    const continuation = await backgroundCpu.getJob(continuationId)
    expect(continuation?.data).toEqual({ cursor: { afterId: ids[0], throughId: cursor.throughId } })
    expect(
      await backgroundCpu.searchJobs({
        name: 'bedrock-embeddings.poll_batch',
        data: { batch_id: ids[0] },
      }),
    ).toHaveLength(1)
    expect(
      await backgroundCpu.searchJobs({
        name: 'bedrock-embeddings.poll_batch',
        data: { batch_id: ids[1] },
      }),
    ).toHaveLength(0)
    if (!continuation) throw new Error('Expected persisted polling continuation')

    await expect(
      processBedrockEmbeddingsBatchJob(continuation as Job<Record<string, unknown>>),
    ).resolves.toEqual({
      count: 1,
      hasMore: false,
    })
    expect(
      await backgroundCpu.searchJobs({
        name: 'bedrock-embeddings.poll_batch',
        data: { batch_id: ids[0] },
      }),
    ).toHaveLength(1)
    expect(
      await backgroundCpu.searchJobs({
        name: 'bedrock-embeddings.poll_batch',
        data: { batch_id: ids[1] },
      }),
    ).toHaveLength(1)
    expect(
      await backgroundCpu.searchJobs({
        name: 'bedrock-embeddings.poll_batch',
        data: { batch_id: ids[2] },
      }),
    ).toHaveLength(0)
    expect(await backgroundCpu.getJob(terminalContinuationId)).toBeNull()
  })

  it('continues stale cleanup past provider-completed batches awaiting ingestion', async () => {
    onTestFinished(
      overrideDynamicConfigFieldsForTest(bedrockEmbeddingsBatchConfig, {
        batch_listing_page_size: 1,
        stale_ttl_hours: 1,
      }),
    )
    const timestamp = Date.UTC(2401, 0, 1) + parseInt(randomUUID().slice(0, 8), 16)
    const ids = [0, 1, 2].map(offset => getMinUUIDv7ForDate(new Date(timestamp + offset)))
    const cursor = {
      afterId: getMinUUIDv7ForDate(new Date(timestamp - 1)),
      throughId: ids[2]!,
    }
    const continuationId = `bedrock-embeddings__stale_cleanup_dispatcher__${cursor.throughId}__${ids[0]}`
    const terminalContinuationId = `bedrock-embeddings__stale_cleanup_dispatcher__${cursor.throughId}__${ids[1]}`
    onTestFinished(async () => {
      await (await backgroundCpu.getJob(continuationId))?.remove()
      await (await backgroundCpu.getJob(terminalContinuationId))?.remove()
      await cleanupTestEmbeddingsBatches(ids)
      vi.mocked(BedrockControlClient.send).mockReset()
    })
    const jobArns = ids.map(
      id => `arn:aws:bedrock:us-west-2:123456789012:model-invocation-job/${id}`,
    )
    await Promise.all(
      ids.map((id, index) =>
        insertTestEmbeddingsBatch({
          id,
          jobArn: jobArns[index],
          submittedAt: new Date(Date.now() - 7_200_000),
        }),
      ),
    )
    vi.mocked(BedrockControlClient.send)
      .mockReset()
      .mockResolvedValue({ status: 'Completed' } as never)

    await expect(processStaleCleanupDispatcher(cursor)).resolves.toMatchObject({
      inspected: 1,
      reconciled: 1,
      hasMore: true,
    })
    const continuation = await backgroundCpu.getJob(continuationId)
    expect(continuation?.data).toEqual({ cursor: { afterId: ids[0], throughId: cursor.throughId } })
    expect(BedrockControlClient.send).toHaveBeenCalledTimes(1)
    expect(BedrockControlClient.send).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ input: { jobIdentifier: jobArns[0] } }),
    )
    if (!continuation) throw new Error('Expected persisted stale-cleanup continuation')

    await expect(
      processBedrockEmbeddingsBatchJob(continuation as Job<Record<string, unknown>>),
    ).resolves.toMatchObject({
      inspected: 1,
      reconciled: 1,
      hasMore: false,
    })
    expect(BedrockControlClient.send).toHaveBeenCalledTimes(2)
    expect(BedrockControlClient.send).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ input: { jobIdentifier: jobArns[1] } }),
    )
    expect(await backgroundCpu.getJob(terminalContinuationId)).toBeNull()
    await expect(getTestBatchSummary(ids[0]!)).resolves.toMatchObject({ status: 'submitted' })
    await expect(getTestBatchSummary(ids[1]!)).resolves.toMatchObject({ status: 'submitted' })
  })
})
