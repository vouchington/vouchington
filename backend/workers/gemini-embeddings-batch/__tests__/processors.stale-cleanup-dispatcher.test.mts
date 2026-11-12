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
    overrideDynamicConfigFieldsForTest(geminiEmbeddingsBatchConfig, { stale_ttl_hours: 144 })
  })

  afterAll(async () => {
    await closeScopedDynamicConfigContext([geminiEmbeddingsBatchConfig])
  })

  it('uses the default 144h TTL so a 2-hour-old batch is not stale', async () => {
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

  it('uses a valid shorter TTL after the provider queue and processing windows', async () => {
    overrideDynamicConfigFieldsForTest(geminiEmbeddingsBatchConfig, { stale_ttl_hours: 96 })
    const id = batchId()
    await insertTestEmbeddingsBatch({
      id,
      jobName: `projects/123456/locations/us/batchPredictionJobs/${id}`,
      vertexState: 'JOB_STATE_PENDING',
      submittedAt: new Date(Date.now() - 97 * 60 * 60 * 1000),
    })

    const result = await processStaleCleanupDispatcher(id)

    expect(result.inspected).toBeGreaterThanOrEqual(1)
    const summary = await getTestBatchSummary(id)
    expect(summary?.status).toBe('failed')
  })

  it('keeps a recent batch active when an override is below the provider-safe minimum', async () => {
    overrideDynamicConfigFieldsForTest(geminiEmbeddingsBatchConfig, { stale_ttl_hours: 1 })
    const id = batchId()
    await insertTestEmbeddingsBatch({
      id,
      jobName: `projects/123456/locations/us/batchPredictionJobs/${id}`,
      vertexState: 'JOB_STATE_PENDING',
      submittedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
    })
    expect((await processStaleCleanupDispatcher(id)).inspected).toBe(0)
    expect((await getTestBatchSummary(id))?.status).toBe('submitted')
  })

  it('falls back to default 144h when override is zero or negative', async () => {
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
