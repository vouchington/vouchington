import { randomUUID } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BedrockControlClient } from '@modules/aws/bedrock-control'
import {
  cleanupTestEmbeddingsBatches,
  insertTestEmbeddingsBatch,
} from '@voucha/test-helpers/entities/bedrock-embeddings-batches'
import { processBatchPolling } from '../processors.mts'

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

describe('processBatchPolling', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(async () => {
    await cleanupTestEmbeddingsBatches(createdBatchIds.splice(0))
  })

  function batchId() {
    const id = `poll-processor-${randomUUID()}`
    createdBatchIds.push(id)
    return id
  }

  it('returns the stored status without downloading results when the batch is not complete', async () => {
    const id = batchId()
    await insertTestEmbeddingsBatch({ id, bedrockStatus: 'Failed' })

    await expect(processBatchPolling(id)).resolves.toEqual({ success: true, status: 'Failed' })

    expect(BedrockControlClient.send).not.toHaveBeenCalled()
  })

  it('throws when the batch row disappears after the provider poll', async () => {
    const id = batchId()
    const jobArn = `arn:aws:bedrock:us-west-2:123:model-invocation-job/${id}`
    await insertTestEmbeddingsBatch({ id, bedrockStatus: 'Submitted', jobArn })
    vi.mocked(BedrockControlClient.send).mockImplementation(async () => {
      await cleanupTestEmbeddingsBatches([id])
      return { status: 'InProgress' }
    })

    await expect(processBatchPolling(id)).rejects.toThrow(`Batch not found: ${id}`)
  })
})
