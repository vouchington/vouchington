import { createTestTopic } from '@voucha/test-helpers'
import { getTopicEmbeddingData } from '@voucha/test-helpers/entities/topics'
import { insertBatchTopicMembership } from '@voucha/test-helpers/gemini-batch-ingestion'
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
const processBatchPolling = (id: string, finalAttempt = false) =>
  fixture.run(() => actualProcessBatchPolling(id, finalAttempt))
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
  it('uses the final queue attempt to fail result downloads and remove membership', async () => {
    const id = batchId()
    const topic = await createTestTopic({ name: `Ingestion ${id}` })
    const jobName = `projects/123456/locations/us/batchPredictionJobs/${id}`
    await insertTestEmbeddingsBatch({
      id,
      jobName,
      records: 1,
      batchData: {
        manifestGcsUri: `gs://synthetic-embeddings/${id}/manifest.csv`,
        outputGcsUri: `gs://synthetic-embeddings/${id}/output/`,
      },
    })
    await insertBatchTopicMembership(id, topic.id)
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
    fixture.agent
      .get('https://storage.googleapis.com')
      .intercept({ method: 'GET', path: /\/o\?/ })
      .reply(200, {
        items: [{ name: `${id}/output/predictions.jsonl`, generation: '1', size: '1' }],
      })
      .times(3)
    await expect(processBatchPolling(id)).rejects.toThrow('result ingestion failed')
    expect(await getTestBatchEntities(id)).toHaveLength(1)
    await expect(processBatchPolling(id)).rejects.toThrow('result ingestion failed')
    expect(await getTestBatchEntities(id)).toHaveLength(1)
    await expect(processBatchPolling(id, true)).rejects.toThrow('result ingestion failed')
    expect(await getTestBatchSummary(id)).toMatchObject({ status: 'failed' })
    expect(await getTestBatchEntities(id)).toEqual([])
  })
  it('validates every pinned output before applying any entity vector', async () => {
    const id = batchId()
    const first = await createTestTopic({ name: `First ${id}` })
    const second = await createTestTopic({ name: `Second ${id}` })
    const jobName = `projects/123456/locations/us/batchPredictionJobs/${id}`
    await insertTestEmbeddingsBatch({
      id,
      jobName,
      records: 2,
      batchData: {
        manifestGcsUri: `gs://synthetic-embeddings/${id}/manifest.csv`,
        outputGcsUri: `gs://synthetic-embeddings/${id}/output/`,
      },
    })
    await insertBatchTopicMembership(id, first.id)
    await insertBatchTopicMembership(id, second.id)
    const firstData = (await getTopicEmbeddingData(first.id)) as {
      gemini_embedding_2_content_sha256: Buffer
    }
    const secondData = (await getTopicEmbeddingData(second.id)) as {
      gemini_embedding_2_content_sha256: Buffer
    }
    fixture.agent
      .get('https://us-aiplatform.googleapis.com')
      .intercept({ method: 'GET', path: `/v1/${jobName}` })
      .reply(200, { name: jobName, state: 'JOB_STATE_SUCCEEDED' })
    const storage = fixture.agent.get('https://storage.googleapis.com')
    storage
      .intercept({ method: 'GET', path: /manifest.csv.*alt=media/ })
      .reply(
        200,
        `${first.id},${firstData.gemini_embedding_2_content_sha256.toString('hex')}\n${second.id},${secondData.gemini_embedding_2_content_sha256.toString('hex')}\n`,
      )
    const object = `${id}/output/predictions.jsonl`
    storage
      .intercept({ method: 'GET', path: /\/o\?/ })
      .reply(200, { items: [{ name: object, generation: '9007199254740993', size: '20000' }] })
    storage
      .intercept({
        method: 'GET',
        path: `/storage/v1/b/synthetic-embeddings/o/${encodeURIComponent(object)}?alt=media&generation=9007199254740993`,
      })
      .reply(
        200,
        [
          JSON.stringify({
            key: `topic:${first.id}`,
            response: { embedding: { values: Array.from({ length: 1536 }, () => 0.125) } },
          }),
          JSON.stringify({ key: `topic:${second.id}`, response: { embedding: { values: [] } } }),
        ].join('\n'),
      )
    await expect(processBatchPolling(id)).rejects.toThrow('result ingestion failed')
    expect(await getTopicEmbeddingData(first.id)).toMatchObject({
      gemini_embedding_2_embedding: null,
    })
    expect(await getTestBatchEntities(id)).toHaveLength(2)
  })
})
