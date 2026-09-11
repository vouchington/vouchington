import { randomUUID } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BedrockControlClient } from '@modules/aws/bedrock-control'
import {
  cleanupTestEmbeddingsBatches,
  getTestBatchTerminalTimestamps,
  getTestBatchSummary,
  insertTestEmbeddingsBatch,
} from '@voucha/test-helpers/entities/bedrock-embeddings-batches'
import { processBatch } from '../poll.mts'

vi.mock<typeof import('@modules/aws/bedrock-control')>(
  import('@modules/aws/bedrock-control'),
  async importOriginal => ({
    ...(await importOriginal<typeof import('@modules/aws/bedrock-control')>()),
    BedrockControlClient: {
      send: vi.fn<VitestLooseMock>(),
    } as unknown as typeof import('@modules/aws/bedrock-control').BedrockControlClient,
  }),
)

const batchIdPrefix = 'poll-mock-test-'
const createdBatchIds: string[] = []

describe('processBatch', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(async () => {
    await cleanupTestEmbeddingsBatches(createdBatchIds.splice(0))
  })

  function batchId() {
    const id = `${batchIdPrefix}${randomUUID()}`
    createdBatchIds.push(id)
    return id
  }

  it('sets completed_at when Bedrock reports Completed', async () => {
    const id = batchId()
    await insertTestEmbeddingsBatch({ id, bedrockStatus: 'Submitted' })
    vi.mocked(BedrockControlClient.send).mockResolvedValue({ status: 'Completed' } as never)

    await processBatch(id)

    expect(await getTestBatchSummary(id)).toEqual({ job_type: 'topics', status: 'completed' })
  })

  it('sets failed_at when Bedrock reports Failed', async () => {
    const id = batchId()
    await insertTestEmbeddingsBatch({ id, bedrockStatus: 'Submitted' })
    vi.mocked(BedrockControlClient.send).mockResolvedValue({ status: 'Failed' } as never)

    await processBatch(id)

    expect(await getTestBatchSummary(id)).toEqual({ job_type: 'topics', status: 'failed' })
  })

  it('sets cancelled_at when Bedrock reports Stopped', async () => {
    const id = batchId()
    await insertTestEmbeddingsBatch({ id, bedrockStatus: 'Submitted' })
    vi.mocked(BedrockControlClient.send).mockResolvedValue({ status: 'Stopped' } as never)

    await processBatch(id)

    expect(await getTestBatchSummary(id)).toEqual({ job_type: 'topics', status: 'cancelled' })
  })

  it('sets failed_at for unrecognised Bedrock statuses to prevent indefinite polling', async () => {
    const id = batchId()
    await insertTestEmbeddingsBatch({ id, bedrockStatus: 'Submitted' })
    vi.mocked(BedrockControlClient.send).mockResolvedValue({
      status: 'UnknownFutureStatus',
    } as never)

    await processBatch(id)

    expect(await getTestBatchSummary(id)).toEqual({ job_type: 'topics', status: 'failed' })
  })

  it('does not replace an existing terminal result when Bedrock later reports another status', async () => {
    const id = batchId()
    await insertTestEmbeddingsBatch({ id, bedrockStatus: 'Completed' })
    vi.mocked(BedrockControlClient.send).mockResolvedValue({ status: 'Failed' } as never)

    await processBatch(id)

    const lifecycle = await getTestBatchTerminalTimestamps(id)
    expect(lifecycle?.completed_at).not.toBeNull()
    expect(lifecycle?.failed_at).toBeNull()
    expect(lifecycle?.cancelled_at).toBeNull()
  })

  it('cleans up and returns without polling an already failed batch', async () => {
    const id = batchId()
    await insertTestEmbeddingsBatch({ id, bedrockStatus: 'Failed' })

    await processBatch(id)

    expect(BedrockControlClient.send).not.toHaveBeenCalled()
    expect(await getTestBatchSummary(id)).toEqual({ job_type: 'topics', status: 'failed' })
  })
})
