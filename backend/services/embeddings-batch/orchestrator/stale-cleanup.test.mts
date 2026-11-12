import { createTestTopic } from '@voucha/test-helpers'
import { insertBatchTopicMembership } from '@voucha/test-helpers/gemini-batch-ingestion'
import { mintUUIDv7, getMinUUIDv7ForDate } from '@modules/utils/ids'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { geminiEmbeddingsBatchConfig } from '@services/embeddings/batch/config'
import { afterEach, beforeEach, describe, expect, it, onTestFinished } from 'vitest'
import { createVertexHttpFixture } from '@voucha/test-helpers/vertex-http'
import {
  cleanupTestEmbeddingsBatches,
  getTestBatchSummary,
  getTestBatchEntities,
  insertTestEmbeddingsBatch,
} from '@voucha/test-helpers/entities/gemini-embeddings-batches'
import { runStaleCleanup as actualRunStaleCleanup } from './stale-cleanup.mts'
import { uuidAfter, uuidBefore } from '@voucha/test-helpers/uuid-before'

describe('runStaleCleanup', () => {
  let fixture: ReturnType<typeof createVertexHttpFixture>
  let providerState: string
  let cancelStatus: number
  let requests: number
  const createdBatchIds: string[] = []

  function batchId() {
    const id = mintUUIDv7()
    createdBatchIds.push(id)
    return id
  }

  const runStaleCleanup = (...args: Parameters<typeof actualRunStaleCleanup>) =>
    fixture.run(() => actualRunStaleCleanup(...args))
  const ownedCursor = (id: string) => ({ afterId: uuidBefore(id), throughId: uuidAfter(id) })

  beforeEach(() => {
    fixture = createVertexHttpFixture()
    providerState = 'JOB_STATE_PENDING'
    cancelStatus = 200
    requests = 0
    fixture.agent
      .get('https://us-aiplatform.googleapis.com')
      .intercept({
        method: 'GET',
        path: /^\/v1\/projects\/123456\/locations\/us\/batchPredictionJobs\/[^/?]+$/,
      })
      .reply(200, options => {
        requests++
        return { name: options.path.slice(4), state: providerState }
      })
      .persist()
    fixture.agent
      .get('https://us-aiplatform.googleapis.com')
      .intercept({ method: 'POST', path: /:cancel$/ })
      .reply(() => {
        requests++
        return { statusCode: cancelStatus, data: {} }
      })
      .persist()
  })

  afterEach(async () => {
    await cleanupTestEmbeddingsBatches(createdBatchIds.splice(0))
  })

  it('bounds stale provider work and continues past batches still awaiting result ingestion', async () => {
    onTestFinished(
      overrideDynamicConfigFieldsForTest(geminiEmbeddingsBatchConfig, {
        batch_listing_page_size: 1,
      }),
    )
    const timestamp = Date.now() + 86_400_000 + Math.floor(Math.random() * 1_000_000_000)
    const ids = [0, 1].map(offset => getMinUUIDv7ForDate(new Date(timestamp + offset)))
    onTestFinished(() => cleanupTestEmbeddingsBatches(ids))
    await Promise.all(
      ids.map(id =>
        insertTestEmbeddingsBatch({
          id,
          jobName: `projects/123456/locations/us/batchPredictionJobs/${id}`,
          vertexState: 'JOB_STATE_PENDING',
          submittedAt: new Date(Date.now() - 7_200_000),
        }),
      ),
    )
    // Completed provider jobs remain locally pending until their output is downloaded.
    providerState = 'JOB_STATE_SUCCEEDED'
    const first = await runStaleCleanup(1, {
      afterId: getMinUUIDv7ForDate(new Date(timestamp - 1)),
      throughId: getMinUUIDv7ForDate(new Date(timestamp + 2)),
    })
    expect(first).toMatchObject({ inspected: 1, hasMore: true, reconciled: 1 })
    expect(first.nextCursor?.afterId).toBe(ids[0])
    expect(requests).toBe(1)
    const last = await runStaleCleanup(1, first.nextCursor)
    expect(last).toMatchObject({ inspected: 1, hasMore: true, reconciled: 1 })
    expect(await runStaleCleanup(1, last.nextCursor)).toMatchObject({
      inspected: 0,
      hasMore: false,
    })
    expect(requests).toBe(2)
  })

  it('advances the raw cursor across a page with no stale batches', async () => {
    onTestFinished(
      overrideDynamicConfigFieldsForTest(geminiEmbeddingsBatchConfig, {
        batch_listing_page_size: 1,
      }),
    )
    const timestamp = Date.now() + 86_400_000 + Math.floor(Math.random() * 1_000_000_000)
    const ids = [0, 1].map(offset => getMinUUIDv7ForDate(new Date(timestamp + offset)))
    onTestFinished(() => cleanupTestEmbeddingsBatches(ids))
    await Promise.all([
      insertTestEmbeddingsBatch({
        id: ids[0],
        jobName: `projects/123456/locations/us/batchPredictionJobs/${ids[0]}`,
        vertexState: 'JOB_STATE_PENDING',
        submittedAt: new Date(),
      }),
      insertTestEmbeddingsBatch({
        id: ids[1],
        jobName: `projects/123456/locations/us/batchPredictionJobs/${ids[1]}`,
        vertexState: 'JOB_STATE_PENDING',
        submittedAt: new Date(Date.now() - 7_200_000),
      }),
    ])
    providerState = 'JOB_STATE_SUCCEEDED'
    const first = await runStaleCleanup(1, {
      afterId: getMinUUIDv7ForDate(new Date(timestamp - 1)),
      throughId: getMinUUIDv7ForDate(new Date(timestamp + 2)),
    })
    expect(first).toMatchObject({ inspected: 0, hasMore: true })
    expect(first.nextCursor?.afterId).toBe(ids[0])
    const second = await runStaleCleanup(1, first.nextCursor)
    expect(second).toMatchObject({ inspected: 1, hasMore: true, reconciled: 1 })
    expect(await runStaleCleanup(1, second.nextCursor)).toMatchObject({
      inspected: 0,
      hasMore: false,
    })
  })

  it('returns empty result when no batches are stale', async () => {
    const id = batchId()
    // 30 minutes old — not stale with 1h TTL
    await insertTestEmbeddingsBatch({
      id,
      vertexState: 'JOB_STATE_PENDING',
      submittedAt: new Date(Date.now() - 30 * 60 * 1000),
    })

    const result = await runStaleCleanup(1, ownedCursor(id))

    expect(result).toEqual({ inspected: 0, reconciled: 0, forcedCancellations: [], hasMore: false })
    expect(requests).toBe(0)
  })

  it('reconciles via processBatch when Vertex reports terminal Failed', async () => {
    const id = batchId()
    await insertTestEmbeddingsBatch({
      id,
      jobName: `projects/123456/locations/us/batchPredictionJobs/${id}`,
      vertexState: 'JOB_STATE_PENDING',
      submittedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
    })
    // retrieveVertexBatch in runStaleCleanup + retrieveVertexBatch in processBatch
    providerState = 'JOB_STATE_FAILED'

    const result = await runStaleCleanup(1, ownedCursor(id))

    expect(result.inspected).toBe(1)
    expect(result.reconciled).toBe(1)
    expect(result.forcedCancellations).toHaveLength(0)
    const summary = await getTestBatchSummary(id)
    expect(summary?.status).toBe('failed')
  })

  it('reconciles via processBatch when Vertex reports terminal Stopped', async () => {
    const id = batchId()
    await insertTestEmbeddingsBatch({
      id,
      jobName: `projects/123456/locations/us/batchPredictionJobs/${id}`,
      vertexState: 'JOB_STATE_PENDING',
      submittedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
    })
    providerState = 'JOB_STATE_CANCELLED'

    const result = await runStaleCleanup(1, ownedCursor(id))

    expect(result.inspected).toBe(1)
    expect(result.reconciled).toBe(1)
    expect(result.forcedCancellations).toHaveLength(0)
    const summary = await getTestBatchSummary(id)
    expect(summary?.status).toBe('cancelled')
  })

  it('retires successful output abandoned beyond the configured lifetime without cancellation', async () => {
    const id = batchId()
    await insertTestEmbeddingsBatch({
      id,
      jobName: `projects/123456/locations/us/batchPredictionJobs/${id}`,
      vertexState: 'JOB_STATE_PENDING',
      submittedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
    })
    const topic = await createTestTopic({ name: `Abandoned ${id}` })
    await insertBatchTopicMembership(id, topic.id)
    providerState = 'JOB_STATE_SUCCEEDED'

    const result = await runStaleCleanup(1, ownedCursor(id))

    expect(result.inspected).toBe(1)
    expect(result.reconciled).toBe(1)
    expect(result.forcedCancellations).toHaveLength(0)
    const summary = await getTestBatchSummary(id)
    expect(summary?.status).toBe('failed')
    expect(await getTestBatchEntities(id)).toEqual([])
    // Only Vertex GET — no processBatch (second Vertex call)
    expect(requests).toBe(1)
  })

  it('force-cancels and records in forcedCancellations when Vertex still reports Submitted', async () => {
    const id = batchId()
    await insertTestEmbeddingsBatch({
      id,
      jobName: `projects/123456/locations/us/batchPredictionJobs/${id}`,
      vertexState: 'JOB_STATE_PENDING',
      submittedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
    })
    // First call: retrieveVertexBatch (still running). Second call: stopVertexBatch (no-op response).
    providerState = 'JOB_STATE_PENDING'

    const result = await runStaleCleanup(1, ownedCursor(id))

    expect(result.inspected).toBe(1)
    expect(result.reconciled).toBe(0)
    expect(result.forcedCancellations).toHaveLength(1)
    expect(result.forcedCancellations[0]!.id).toBe(id)
    const summary = await getTestBatchSummary(id)
    expect(summary?.status).toBe('submitted')
    // Two calls: one Vertex GET + one Vertex cancel
    expect(requests).toBe(2)
  })

  it('force-cancels when Vertex still reports InProgress past TTL', async () => {
    const id = batchId()
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000)
    await insertTestEmbeddingsBatch({
      id,
      jobName: `projects/123456/locations/us/batchPredictionJobs/${id}`,
      vertexState: 'JOB_STATE_RUNNING',
      submittedAt: twoHoursAgo,
      inProgressAt: twoHoursAgo,
    })
    providerState = 'JOB_STATE_RUNNING'

    const result = await runStaleCleanup(1, ownedCursor(id))

    expect(result.inspected).toBe(1)
    expect(result.forcedCancellations).toHaveLength(1)
    const summary = await getTestBatchSummary(id)
    expect(summary?.status).toBe('in_progress')
  })

  it('skips batch when stopVertexBatch fails, leaving it for the next cycle', async () => {
    const id = batchId()
    await insertTestEmbeddingsBatch({
      id,
      jobName: `projects/123456/locations/us/batchPredictionJobs/${id}`,
      vertexState: 'JOB_STATE_PENDING',
      submittedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
    })
    // retrieveVertexBatch returns still-running; stopVertexBatch throws (e.g. transient error)
    providerState = 'JOB_STATE_PENDING'
    cancelStatus = 503

    const result = await runStaleCleanup(1, ownedCursor(id))

    expect(result.inspected).toBe(1)
    expect(result.reconciled).toBe(0)
    expect(result.forcedCancellations).toHaveLength(0)
    // Batch must remain non-terminal so the next stale-cleanup cycle retries it
    const summary = await getTestBatchSummary(id)
    expect(summary?.status).toBe('submitted')
    expect(requests).toBe(2)
  })

  it('is idempotent: already-cancelled batches are not returned as stale', async () => {
    const id = batchId()
    await insertTestEmbeddingsBatch({
      id,
      vertexState: 'JOB_STATE_CANCELLED',
      submittedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
    })

    const result = await runStaleCleanup(1, ownedCursor(id))

    expect(result.inspected).toBe(0)
    expect(requests).toBe(0)
  })
})
