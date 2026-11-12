import { createTestTopic } from '@voucha/test-helpers'
import {
  getBatchIngestionFailures,
  insertBatchTopicLock,
} from '@voucha/test-helpers/gemini-batch-ingestion'
import { mintUUIDv7 } from '../../../modules/utils/ids.mts'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createVertexHttpFixture } from '@voucha/test-helpers/vertex-http'
import {
  cleanupTestEmbeddingsBatches,
  getTestBatchEntities,
  getTestBatchSummary,
  insertTestEmbeddingsBatch,
} from '@voucha/test-helpers/entities/gemini-embeddings-batches'
import { processBatchPolling as actualProcessBatchPolling } from '../processors.mts'

let fixture: ReturnType<typeof createVertexHttpFixture>
const processBatchPolling = (id: string) => fixture.run(() => actualProcessBatchPolling(id))
const createdBatchIds: string[] = []

describe('processBatchPolling', () => {
  beforeEach(() => {
    fixture = createVertexHttpFixture()
  })

  afterEach(async () => {
    await cleanupTestEmbeddingsBatches(createdBatchIds.splice(0))
  })

  function batchId() {
    const id = mintUUIDv7()
    createdBatchIds.push(id)
    return id
  }

  it('returns the stored status without downloading results when the batch is not complete', async () => {
    const id = batchId()
    await insertTestEmbeddingsBatch({ id, vertexState: 'JOB_STATE_FAILED' })

    await expect(processBatchPolling(id)).resolves.toEqual({
      success: true,
      status: 'JOB_STATE_FAILED',
    })
  })

  it('throws when the batch row disappears after the provider poll', async () => {
    const id = batchId()
    const jobName = `projects/123456/locations/us/batchPredictionJobs/${id}`
    await insertTestEmbeddingsBatch({ id, vertexState: 'JOB_STATE_PENDING', jobName })
    fixture.agent
      .get('https://us-aiplatform.googleapis.com')
      .intercept({ method: 'GET', path: `/v1/${jobName}` })
      .reply(async () => {
        await cleanupTestEmbeddingsBatches([id])
        return { statusCode: 200, data: { name: jobName, state: 'JOB_STATE_RUNNING' } }
      })

    await expect(processBatchPolling(id)).rejects.toThrow(`Batch not found: ${id}`)
  })
  it('fails after three terminal-result download errors and atomically releases entity locks', async () => {
    const id = batchId()
    const topic = await createTestTopic({ name: `Ingestion ${id}` })
    const jobName = `projects/123456/locations/us/batchPredictionJobs/${id}`
    await insertTestEmbeddingsBatch({
      id,
      jobName,
      records: 1,
      batchData: { manifestGcsUri: `gs://synthetic-embeddings/${id}/manifest.csv` },
    })
    await insertBatchTopicLock(id, topic.id)
    fixture.agent
      .get('https://us-aiplatform.googleapis.com')
      .intercept({ method: 'GET', path: `/v1/${jobName}` })
      .reply(200, { name: jobName, state: 'JOB_STATE_SUCCEEDED' })
      .times(3)
    fixture.agent
      .get('https://storage.googleapis.com')
      .intercept({ method: 'GET', path: /manifest.csv.*alt=media/ })
      .reply(503, {})
      .times(3)
    await expect(processBatchPolling(id)).rejects.toThrow('(503)')
    expect(await getBatchIngestionFailures(id)).toBe(1)
    expect(await getTestBatchEntities(id)).toHaveLength(1)
    await expect(processBatchPolling(id)).rejects.toThrow('(503)')
    expect(await getBatchIngestionFailures(id)).toBe(2)
    expect(await getTestBatchEntities(id)).toHaveLength(1)
    await expect(processBatchPolling(id)).rejects.toThrow('(503)')
    expect(await getBatchIngestionFailures(id)).toBe(3)
    expect(await getTestBatchSummary(id)).toMatchObject({ status: 'failed' })
    expect(await getTestBatchEntities(id)).toEqual([])
  })
})
