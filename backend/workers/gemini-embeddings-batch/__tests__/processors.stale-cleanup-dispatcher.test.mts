import { mintUUIDv7 } from '../../../modules/utils/ids.mts'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createVertexHttpFixture } from '@voucha/test-helpers/vertex-http'
import { uuidBefore, uuidAfter } from '@voucha/test-helpers/uuid-before'
import {
  cleanupTestEmbeddingsBatches,
  getTestBatchSummary,
  insertTestEmbeddingsBatch,
} from '@voucha/test-helpers/entities/gemini-embeddings-batches'
import { geminiEmbeddingsBatchConfig } from '@services/embeddings/batch/config'
import {
  overrideDynamicConfigFieldsForTest,
  closeScopedDynamicConfigContext,
} from '@voucha/test-helpers/dynamic-config'
import { processStaleCleanupDispatcher as actualProcessStaleCleanupDispatcher } from '../processors.mts'

let fixture: ReturnType<typeof createVertexHttpFixture>
const processStaleCleanupDispatcher = (id: string) =>
  fixture.run(() =>
    actualProcessStaleCleanupDispatcher({ afterId: uuidBefore(id), throughId: uuidAfter(id) }),
  )
const createdBatchIds: string[] = []

function batchId() {
  const id = mintUUIDv7()
  createdBatchIds.push(id)
  return id
}

describe('processStaleCleanupDispatcher', () => {
  beforeAll(async () => {
    await geminiEmbeddingsBatchConfig.waitForInitialization()
    geminiEmbeddingsBatchConfig.unsubscribe()
  })

  beforeEach(() => {
    fixture = createVertexHttpFixture()
    fixture.agent
      .get('https://us-aiplatform.googleapis.com')
      .intercept({
        method: 'GET',
        path: /^\/v1\/projects\/123456\/locations\/us\/batchPredictionJobs\/[^/?]+$/,
      })
      .reply(200, options => ({ name: options.path.slice(4), state: 'JOB_STATE_FAILED' }))
      .persist()
  })

  afterEach(async () => {
    await cleanupTestEmbeddingsBatches(createdBatchIds.splice(0))
    overrideDynamicConfigFieldsForTest(geminiEmbeddingsBatchConfig, { stale_ttl_hours: 24 })
  })

  afterAll(async () => {
    await closeScopedDynamicConfigContext([geminiEmbeddingsBatchConfig])
  })

  it('uses the default 24h TTL so a 2-hour-old batch is not stale', async () => {
    const id = batchId()
    await insertTestEmbeddingsBatch({
      id,
      jobName: `projects/123456/locations/us/batchPredictionJobs/${id}`,
      vertexState: 'JOB_STATE_PENDING',
      submittedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
    })

    const result = await processStaleCleanupDispatcher(id)

    expect(result.inspected).toBe(0)
  })

  it('uses DynamicConfig override TTL so a 2-hour-old batch is stale at TTL=1', async () => {
    overrideDynamicConfigFieldsForTest(geminiEmbeddingsBatchConfig, { stale_ttl_hours: 1 })
    const id = batchId()
    await insertTestEmbeddingsBatch({
      id,
      jobName: `projects/123456/locations/us/batchPredictionJobs/${id}`,
      vertexState: 'JOB_STATE_PENDING',
      submittedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
    })

    const result = await processStaleCleanupDispatcher(id)

    expect(result.inspected).toBeGreaterThanOrEqual(1)
    const summary = await getTestBatchSummary(id)
    expect(summary?.status).toBe('failed')
  })

  it('falls back to default 24h when override is zero or negative', async () => {
    overrideDynamicConfigFieldsForTest(geminiEmbeddingsBatchConfig, { stale_ttl_hours: 0 })
    const id = batchId()
    await insertTestEmbeddingsBatch({
      id,
      jobName: `projects/123456/locations/us/batchPredictionJobs/${id}`,
      vertexState: 'JOB_STATE_PENDING',
      submittedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
    })

    const result = await processStaleCleanupDispatcher(id)

    expect(result.inspected).toBe(0)
  })
})
