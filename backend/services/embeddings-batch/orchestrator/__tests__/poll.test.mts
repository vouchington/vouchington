import { mintUUIDv7 } from '@modules/utils/ids'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createVertexHttpFixture } from '@voucha/test-helpers/vertex-http'
import {
  cleanupTestEmbeddingsBatches,
  getTestBatchTerminalTimestamps,
  getTestBatchSummary,
  insertTestEmbeddingsBatch,
} from '@voucha/test-helpers/entities/gemini-embeddings-batches'
import { processBatch as actualProcessBatch } from '../poll.mts'

let fixture: ReturnType<typeof createVertexHttpFixture>
const processBatch = (id: string) => fixture.run(() => actualProcessBatch(id))
function replyState(state: string) {
  fixture.agent
    .get('https://us-aiplatform.googleapis.com')
    .intercept({
      method: 'GET',
      path: /^\/v1\/projects\/123456\/locations\/us\/batchPredictionJobs\/[^/?]+$/,
    })
    .reply(200, options => ({ name: options.path.slice(4), state }))
    .persist()
}
const createdBatchIds: string[] = []

describe('processBatch', () => {
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

  it('keeps an unresolved remote submission pollable while listing finds no match', async () => {
    const id = batchId()
    await insertTestEmbeddingsBatch({ id, jobName: null })
    fixture.agent
      .get('https://us-aiplatform.googleapis.com')
      .intercept({
        method: 'GET',
        path: /^\/v1\/projects\/synthetic-project\/locations\/us\/batchPredictionJobs\?/,
      })
      .reply(200, {})
    await processBatch(id)
    expect(await getTestBatchSummary(id)).toEqual({ job_type: 'topics', status: 'submitted' })
  })

  it('keeps provider success pending until result ingestion commits', async () => {
    const id = batchId()
    await insertTestEmbeddingsBatch({
      id,
      vertexState: 'JOB_STATE_PENDING',
      jobName: `projects/123456/locations/us/batchPredictionJobs/${id}`,
    })
    replyState('JOB_STATE_SUCCEEDED')

    await processBatch(id)

    expect(await getTestBatchSummary(id)).toEqual({ job_type: 'topics', status: 'in_progress' })
  })

  it('sets failed_at when Vertex reports Failed', async () => {
    const id = batchId()
    await insertTestEmbeddingsBatch({
      id,
      vertexState: 'JOB_STATE_PENDING',
      jobName: `projects/123456/locations/us/batchPredictionJobs/${id}`,
    })
    replyState('JOB_STATE_FAILED')

    await processBatch(id)

    expect(await getTestBatchSummary(id)).toEqual({ job_type: 'topics', status: 'failed' })
  })

  it('sets cancelled_at when Vertex reports Stopped', async () => {
    const id = batchId()
    await insertTestEmbeddingsBatch({
      id,
      vertexState: 'JOB_STATE_PENDING',
      jobName: `projects/123456/locations/us/batchPredictionJobs/${id}`,
    })
    replyState('JOB_STATE_CANCELLED')

    await processBatch(id)

    expect(await getTestBatchSummary(id)).toEqual({ job_type: 'topics', status: 'cancelled' })
  })

  it('sets failed_at for unrecognised Vertex statuses to prevent indefinite polling', async () => {
    const id = batchId()
    await insertTestEmbeddingsBatch({
      id,
      vertexState: 'JOB_STATE_PENDING',
      jobName: `projects/123456/locations/us/batchPredictionJobs/${id}`,
    })
    replyState('UnknownFutureStatus')

    await processBatch(id)

    expect(await getTestBatchSummary(id)).toEqual({ job_type: 'topics', status: 'failed' })
  })

  it('does not replace an existing terminal result when Vertex later reports another status', async () => {
    const id = batchId()
    await insertTestEmbeddingsBatch({ id, vertexState: 'JOB_STATE_SUCCEEDED' })
    replyState('JOB_STATE_FAILED')

    await processBatch(id)

    const lifecycle = await getTestBatchTerminalTimestamps(id)
    expect(lifecycle?.completed_at).not.toBeNull()
    expect(lifecycle?.failed_at).toBeNull()
    expect(lifecycle?.cancelled_at).toBeNull()
  })

  it('cleans up and returns without polling an already failed batch', async () => {
    const id = batchId()
    await insertTestEmbeddingsBatch({ id, vertexState: 'JOB_STATE_FAILED' })

    await processBatch(id)

    expect(await getTestBatchSummary(id)).toEqual({ job_type: 'topics', status: 'failed' })
  })
  it.each([
    [90, 'submitted'],
    [121, 'failed'],
  ] as const)(
    'expires a missing receipt only after its two-hour window (%s minutes)',
    async (minutes, status) => {
      const id = batchId()
      await insertTestEmbeddingsBatch({
        id,
        jobName: null,
        submittedAt: new Date(Date.now() - minutes * 60_000),
      })
      fixture.agent
        .get('https://us-aiplatform.googleapis.com')
        .intercept({ method: 'GET', path: /batchPredictionJobs\?/ })
        .reply(200, {})
      await processBatch(id)
      expect(await getTestBatchSummary(id)).toMatchObject({ status })
    },
  )

  it('retains an old receipt intent when provider lookup fails', async () => {
    const id = batchId()
    await insertTestEmbeddingsBatch({
      id,
      jobName: null,
      submittedAt: new Date(Date.now() - 3 * 60 * 60_000),
    })
    fixture.agent
      .get('https://us-aiplatform.googleapis.com')
      .intercept({ method: 'GET', path: /batchPredictionJobs\?/ })
      .reply(503, {})
    await expect(processBatch(id)).rejects.toThrow('(503)')
    expect(await getTestBatchSummary(id)).toMatchObject({ status: 'submitted' })
  })

  it('keeps a paused provider job in progress', async () => {
    const id = batchId()
    await insertTestEmbeddingsBatch({
      id,
      jobName: `projects/123456/locations/us/batchPredictionJobs/${id}`,
    })
    replyState('JOB_STATE_PAUSED')
    await processBatch(id)
    expect(await getTestBatchSummary(id)).toMatchObject({ status: 'in_progress' })
  })
})
