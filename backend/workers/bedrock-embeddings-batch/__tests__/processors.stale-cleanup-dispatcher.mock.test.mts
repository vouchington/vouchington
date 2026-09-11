import { randomUUID } from 'node:crypto'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { BedrockControlClient } from '@modules/aws/bedrock-control'
import {
  cleanupTestEmbeddingsBatches,
  getTestBatchSummary,
  insertTestEmbeddingsBatch,
} from '@voucha/test-helpers/entities/bedrock-embeddings-batches'
import { bedrockEmbeddingsBatchConfig } from '@services/bedrock-embeddings/batch/config'
import {
  overrideDynamicConfigFieldsForTest,
  closeScopedDynamicConfigContext,
} from '@voucha/test-helpers/dynamic-config'
import { processStaleCleanupDispatcher } from '../processors.mts'

vi.mock<typeof import('@modules/aws/bedrock-control')>(
  import('@modules/aws/bedrock-control'),
  async importOriginal => ({
    ...(await importOriginal<typeof import('@modules/aws/bedrock-control')>()),
    BedrockControlClient: {
      send: vi.fn<VitestLooseMock>(),
    } as unknown as typeof import('@modules/aws/bedrock-control').BedrockControlClient,
  }),
)

const batchIdPrefix = 'stale-cleanup-proc-test-'
const createdBatchIds: string[] = []

function batchId() {
  const id = `${batchIdPrefix}${randomUUID()}`
  createdBatchIds.push(id)
  return id
}

describe('processStaleCleanupDispatcher', () => {
  beforeAll(async () => {
    await bedrockEmbeddingsBatchConfig.waitForInitialization()
    bedrockEmbeddingsBatchConfig.unsubscribe()
  })

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(async () => {
    await cleanupTestEmbeddingsBatches(createdBatchIds.splice(0))
    overrideDynamicConfigFieldsForTest(bedrockEmbeddingsBatchConfig, { stale_ttl_hours: 24 })
  })

  afterAll(async () => {
    await closeScopedDynamicConfigContext([bedrockEmbeddingsBatchConfig])
  })

  it('uses the default 24h TTL so a 2-hour-old batch is not stale', async () => {
    const id = batchId()
    await insertTestEmbeddingsBatch({
      id,
      bedrockStatus: 'Submitted',
      submittedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
    })

    const result = await processStaleCleanupDispatcher()

    expect(result.inspected).toBe(0)
    expect(BedrockControlClient.send).not.toHaveBeenCalled()
  })

  it('uses DynamicConfig override TTL so a 2-hour-old batch is stale at TTL=1', async () => {
    overrideDynamicConfigFieldsForTest(bedrockEmbeddingsBatchConfig, { stale_ttl_hours: 1 })
    const id = batchId()
    await insertTestEmbeddingsBatch({
      id,
      jobArn: `arn:aws:bedrock:us-west-2:123456789012:model-invocation-job/${id}`,
      bedrockStatus: 'Submitted',
      submittedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
    })
    vi.mocked(BedrockControlClient.send).mockResolvedValue({ status: 'Failed' } as never)

    const result = await processStaleCleanupDispatcher()

    expect(result.inspected).toBeGreaterThanOrEqual(1)
    const summary = await getTestBatchSummary(id)
    expect(summary?.status).toBe('failed')
  })

  it('falls back to default 24h when override is zero or negative', async () => {
    overrideDynamicConfigFieldsForTest(bedrockEmbeddingsBatchConfig, { stale_ttl_hours: 0 })
    const id = batchId()
    await insertTestEmbeddingsBatch({
      id,
      bedrockStatus: 'Submitted',
      submittedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
    })

    const result = await processStaleCleanupDispatcher()

    expect(result.inspected).toBe(0)
    expect(BedrockControlClient.send).not.toHaveBeenCalled()
  })
})
