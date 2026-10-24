import { mintUUIDv7, getMinUUIDv7ForDate } from '@modules/utils/ids'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { bedrockEmbeddingsBatchConfig } from '@services/bedrock-embeddings/batch/config'
import { afterEach, beforeEach, describe, expect, it, vi, onTestFinished } from 'vitest'
import { BedrockControlClient } from '@modules/aws/bedrock-control'
import {
  cleanupTestEmbeddingsBatches,
  getTestBatchSummary,
  insertTestEmbeddingsBatch,
} from '@voucha/test-helpers/entities/bedrock-embeddings-batches'
import { runStaleCleanup } from './stale-cleanup.mts'

vi.mock<typeof import('@modules/aws/bedrock-control')>(
  import('@modules/aws/bedrock-control'),
  async importOriginal => ({
    ...(await importOriginal<typeof import('@modules/aws/bedrock-control')>()),
    BedrockControlClient: {
      send: vi.fn<VitestLooseMock>(),
    } as unknown as typeof import('@modules/aws/bedrock-control').BedrockControlClient,
  }),
)

const createdBatchIds: string[] = []

function batchId() {
  const id = mintUUIDv7()
  createdBatchIds.push(id)
  return id
}

describe('runStaleCleanup', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(async () => {
    await cleanupTestEmbeddingsBatches(createdBatchIds.splice(0))
  })

  it('bounds stale provider work and continues past batches still awaiting result ingestion', async () => {
    onTestFinished(
      overrideDynamicConfigFieldsForTest(bedrockEmbeddingsBatchConfig, {
        batch_listing_page_size: 1,
      }),
    )
    const timestamp = Date.now() + 86_400_000 + Math.floor(Math.random() * 1_000_000_000)
    const ids = [0, 1].map(offset => getMinUUIDv7ForDate(new Date(timestamp + offset)))
    onTestFinished(() => cleanupTestEmbeddingsBatches(ids))
    await Promise.all(
      ids.map(id =>
        insertTestEmbeddingsBatch({
          id,
          jobArn: `arn:aws:bedrock:us-west-2:123456789012:model-invocation-job/${id}`,
          bedrockStatus: 'Submitted',
          submittedAt: new Date(Date.now() - 7_200_000),
        }),
      ),
    )
    // Completed provider jobs remain locally pending until their output is downloaded.
    vi.mocked(BedrockControlClient.send).mockResolvedValue({ status: 'Completed' } as never)
    const first = await runStaleCleanup(1, {
      afterId: getMinUUIDv7ForDate(new Date(timestamp - 1)),
      afterStaleAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
      throughId: getMinUUIDv7ForDate(new Date(timestamp + 2)),
      cutoffAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    })
    expect(first).toMatchObject({ inspected: 1, hasMore: true, reconciled: 1 })
    expect(first.nextCursor?.afterId).toBe(ids[0])
    expect(BedrockControlClient.send).toHaveBeenCalledTimes(1)
    const last = await runStaleCleanup(1, first.nextCursor)
    expect(last).toMatchObject({ inspected: 1, hasMore: false, reconciled: 1 })
    expect(BedrockControlClient.send).toHaveBeenCalledTimes(2)
  })

  it('returns empty result when no batches are stale', async () => {
    const id = batchId()
    // 30 minutes old — not stale with 1h TTL
    await insertTestEmbeddingsBatch({
      id,
      bedrockStatus: 'Submitted',
      submittedAt: new Date(Date.now() - 30 * 60 * 1000),
    })

    const result = await runStaleCleanup(1)

    expect(result).toEqual({ inspected: 0, reconciled: 0, forcedCancellations: [], hasMore: false })
    expect(BedrockControlClient.send).not.toHaveBeenCalled()
  })

  it('reconciles via processBatch when Bedrock reports terminal Failed', async () => {
    const id = batchId()
    await insertTestEmbeddingsBatch({
      id,
      jobArn: `arn:aws:bedrock:us-west-2:123456789012:model-invocation-job/${id}`,
      bedrockStatus: 'Submitted',
      submittedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
    })
    // retrieveBedrockBatch in runStaleCleanup + retrieveBedrockBatch in processBatch
    vi.mocked(BedrockControlClient.send).mockResolvedValue({ status: 'Failed' } as never)

    const result = await runStaleCleanup(1)

    expect(result.inspected).toBe(1)
    expect(result.reconciled).toBe(1)
    expect(result.forcedCancellations).toHaveLength(0)
    const summary = await getTestBatchSummary(id)
    expect(summary?.status).toBe('failed')
  })

  it('reconciles via processBatch when Bedrock reports terminal Stopped', async () => {
    const id = batchId()
    await insertTestEmbeddingsBatch({
      id,
      jobArn: `arn:aws:bedrock:us-west-2:123456789012:model-invocation-job/${id}`,
      bedrockStatus: 'Submitted',
      submittedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
    })
    vi.mocked(BedrockControlClient.send).mockResolvedValue({ status: 'Stopped' } as never)

    const result = await runStaleCleanup(1)

    expect(result.inspected).toBe(1)
    expect(result.reconciled).toBe(1)
    expect(result.forcedCancellations).toHaveLength(0)
    const summary = await getTestBatchSummary(id)
    expect(summary?.status).toBe('cancelled')
  })

  it('defers completed batches to poll_dispatcher without setting completed_at', async () => {
    const id = batchId()
    await insertTestEmbeddingsBatch({
      id,
      jobArn: `arn:aws:bedrock:us-west-2:123456789012:model-invocation-job/${id}`,
      bedrockStatus: 'Submitted',
      submittedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
    })
    // Bedrock already completed — stale cleanup must NOT call processBatch here;
    // doing so would mark completed_at and drop the batch from getPendingBatches
    // before poll_dispatcher can download and apply results via processBatchPolling.
    vi.mocked(BedrockControlClient.send).mockResolvedValue({ status: 'Completed' } as never)

    const result = await runStaleCleanup(1)

    expect(result.inspected).toBe(1)
    expect(result.reconciled).toBe(1)
    expect(result.forcedCancellations).toHaveLength(0)
    // completed_at must remain NULL so poll_dispatcher picks it up for result ingestion
    const summary = await getTestBatchSummary(id)
    expect(summary?.status).toBe('submitted')
    // Only GetModelInvocationJobCommand — no processBatch (second Bedrock call)
    expect(BedrockControlClient.send).toHaveBeenCalledTimes(1)
  })

  it('force-cancels and records in forcedCancellations when Bedrock still reports Submitted', async () => {
    const id = batchId()
    await insertTestEmbeddingsBatch({
      id,
      jobArn: `arn:aws:bedrock:us-west-2:123456789012:model-invocation-job/${id}`,
      bedrockStatus: 'Submitted',
      submittedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
    })
    // First call: retrieveBedrockBatch (still running). Second call: stopBedrockBatch (no-op response).
    vi.mocked(BedrockControlClient.send)
      .mockResolvedValueOnce({ status: 'Submitted' } as never)
      .mockResolvedValueOnce({} as never)

    const result = await runStaleCleanup(1)

    expect(result.inspected).toBe(1)
    expect(result.reconciled).toBe(0)
    expect(result.forcedCancellations).toHaveLength(1)
    expect(result.forcedCancellations[0]!.id).toBe(id)
    const summary = await getTestBatchSummary(id)
    expect(summary?.status).toBe('cancelled')
    // Two calls: one GetModelInvocationJobCommand + one StopModelInvocationJobCommand
    expect(BedrockControlClient.send).toHaveBeenCalledTimes(2)
  })

  it('force-cancels when Bedrock still reports InProgress past TTL', async () => {
    const id = batchId()
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000)
    await insertTestEmbeddingsBatch({
      id,
      jobArn: `arn:aws:bedrock:us-west-2:123456789012:model-invocation-job/${id}`,
      bedrockStatus: 'InProgress',
      submittedAt: twoHoursAgo,
      inProgressAt: twoHoursAgo,
    })
    vi.mocked(BedrockControlClient.send)
      .mockResolvedValueOnce({ status: 'InProgress' } as never)
      .mockResolvedValueOnce({} as never)

    const result = await runStaleCleanup(1)

    expect(result.inspected).toBe(1)
    expect(result.forcedCancellations).toHaveLength(1)
    const summary = await getTestBatchSummary(id)
    expect(summary?.status).toBe('cancelled')
  })

  it('skips batch when stopBedrockBatch fails, leaving it for the next cycle', async () => {
    const id = batchId()
    await insertTestEmbeddingsBatch({
      id,
      jobArn: `arn:aws:bedrock:us-west-2:123456789012:model-invocation-job/${id}`,
      bedrockStatus: 'Submitted',
      submittedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
    })
    // retrieveBedrockBatch returns still-running; stopBedrockBatch throws (e.g. transient error)
    vi.mocked(BedrockControlClient.send)
      .mockResolvedValueOnce({ status: 'Submitted' } as never)
      .mockRejectedValueOnce(new Error('StopModelInvocationJob failed'))

    const result = await runStaleCleanup(1)

    expect(result.inspected).toBe(1)
    expect(result.reconciled).toBe(0)
    expect(result.forcedCancellations).toHaveLength(0)
    // Batch must remain non-terminal so the next stale-cleanup cycle retries it
    const summary = await getTestBatchSummary(id)
    expect(summary?.status).toBe('submitted')
    expect(BedrockControlClient.send).toHaveBeenCalledTimes(2)
  })

  it('is idempotent: already-cancelled batches are not returned as stale', async () => {
    const id = batchId()
    await insertTestEmbeddingsBatch({
      id,
      bedrockStatus: 'Stopped',
      submittedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
    })

    const result = await runStaleCleanup(1)

    expect(result.inspected).toBe(0)
    expect(BedrockControlClient.send).not.toHaveBeenCalled()
  })
})
