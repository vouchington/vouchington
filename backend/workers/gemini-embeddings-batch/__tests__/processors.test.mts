import { mintUUIDv7 } from '../../../modules/utils/ids.mts'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createVertexHttpFixture } from '@voucha/test-helpers/vertex-http'
import {
  cleanupTestEmbeddingsBatches,
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
})
