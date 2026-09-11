import { randomUUID } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BedrockControlClient } from '@modules/aws/bedrock-control'
import {
  cleanupTestEmbeddingsBatches,
  cleanupTestEmbeddingsBatchesByPrefix,
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

const batchIdPrefix = 'stale-cleanup-test-'
const createdBatchIds: string[] = []

function batchId() {
  const id = `${batchIdPrefix}${randomUUID()}`
  createdBatchIds.push(id)
  return id
}

describe('runStaleCleanup', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(async () => {
    await cleanupTestEmbeddingsBatches(createdBatchIds.splice(0))
    await cleanupTestEmbeddingsBatchesByPrefix(batchIdPrefix)
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

    expect(result).toEqual({ inspected: 0, reconciled: 0, forcedCancellations: [] })
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
