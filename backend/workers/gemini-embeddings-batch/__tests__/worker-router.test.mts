import { createVertexHttpFixture } from '@voucha/test-helpers/vertex-http'
import { uuidBefore, uuidAfter } from '@voucha/test-helpers/uuid-before'
import { randomBytes, randomUUID } from 'node:crypto'
import { mintUUIDv7 } from '../../../modules/utils/ids.mts'
import { afterAll, afterEach, beforeAll, describe, expect, it, onTestFinished } from 'vitest'
import type { Job } from 'glide-mq'
import { UnrecoverableError } from '@vouchington/queue-errors'
import { decodeUuidCursor, encodeScopedUuidCursor, isSimpleCursor } from '@modules/pagination'
import {
  createTestUserDirect,
  getTopicEmbeddingData,
  insertTestEmbeddings,
  insertTestTopic,
  setTopicEmbeddingContentSha256,
} from '@voucha/test-helpers'
import { encodeUuidCursorBefore } from '@voucha/test-helpers/modules/pagination/uuid-cursors'
import { processEmbeddingsBatchJob } from '../processors/worker-router.mts'
import { geminiEmbeddingsBatchConfig } from '@services/embeddings/batch/config'
import {
  overrideDynamicConfigFieldsForTest,
  closeScopedDynamicConfigContext,
} from '@voucha/test-helpers/dynamic-config'
import {
  cleanupTestEmbeddingsBatches,
  insertTestEmbeddingsBatch,
  getTestBatchSummary,
} from '@voucha/test-helpers/entities/gemini-embeddings-batches'

describe('Gemini embeddings batch worker processor', () => {
  beforeAll(async () => {
    await geminiEmbeddingsBatchConfig.waitForInitialization()
    geminiEmbeddingsBatchConfig.unsubscribe()
  })

  afterEach(async () => {
    overrideDynamicConfigFieldsForTest(geminiEmbeddingsBatchConfig, {
      max_inflight_jobs: 100,
      max_requests_per_hour: 100000,
      max_requests_per_file: 100000,
      max_file_size_gb: 1,
      max_job_size_gb: 100,
      min_records_per_job: 1,
      backlog_threshold: 1000,
      stale_ttl_hours: 24,
    })
  })

  afterAll(async () => {
    await closeScopedDynamicConfigContext([geminiEmbeddingsBatchConfig])
  })

  it('reconciles a cached topic even when Vertex creation is saturated', async () => {
    await blockBatchCreation()
    const user = await createTestUserDirect()
    const suffix = randomUUID().slice(0, 8)
    const topicId = await insertTestTopic({
      name: `Reconciliation Router ${suffix}`,
      slug: `reconciliation-router-${suffix}`,
      createdById: user.id,
    })
    const foreignTopicId = await insertTestTopic({
      name: `Reconciliation Router Foreign ${suffix}`,
      slug: `reconciliation-router-foreign-${suffix}`,
      createdById: user.id,
    })
    const hash = randomBytes(32)
    const foreignHash = randomBytes(32)
    const embedding = new Array<number>(1536).fill(0.25)
    const foreignEmbedding = new Array<number>(1536).fill(0.5)
    await setTopicEmbeddingContentSha256(topicId, hash)
    await setTopicEmbeddingContentSha256(foreignTopicId, foreignHash)
    await insertTestEmbeddings([
      { content_sha256: hash, embedding },
      { content_sha256: foreignHash, embedding: foreignEmbedding },
    ])
    const before = decodeUuidCursor(
      encodeUuidCursorBefore(topicId),
      isSimpleCursor,
      'Invalid cursor',
    )
    const after = encodeScopedUuidCursor(before.id, 'embedding-reconciliation:topics:id-asc')

    const result = (await processEmbeddingsBatchJob(
      makeJob(
        'gemini-embeddings.reconcile_existing',
        { entityType: 'topics', after },
        'gemini-embeddings:reconciliation',
      ),
      { entityIds: [topicId] },
    )) as { updatedIds: string[]; scannedCount: number }
    expect(result.updatedIds).toEqual([topicId])
    expect(result.scannedCount).toBe(1)
    await expect(getTopicEmbeddingData(topicId)).resolves.toMatchObject({
      gemini_embedding_2_input_sha256: hash,
      gemini_embedding_2_embedding: embedding,
      gemini_embedding_2_embedding_created_at: expect.any(Date),
    })
    await expect(getTopicEmbeddingData(foreignTopicId)).resolves.toMatchObject({
      gemini_embedding_2_input_sha256: null,
    })
  })

  it('rejects malformed reconciliation payloads and scoped cursors unrecoverably', async () => {
    for (const data of [
      {},
      { entityType: 'images' },
      { entityType: 'topics', after: 1 },
      { entityType: 'topics', extra: true },
    ]) {
      await expect(
        processEmbeddingsBatchJob(
          makeJob('gemini-embeddings.reconcile_existing', data, 'gemini-embeddings:reconciliation'),
        ),
      ).rejects.toThrow(UnrecoverableError)
    }
    await expect(
      processEmbeddingsBatchJob(
        makeJob(
          'gemini-embeddings.reconcile_existing',
          null as unknown as Record<string, unknown>,
          'gemini-embeddings:reconciliation',
        ),
      ),
    ).rejects.toThrow(UnrecoverableError)
    await expect(
      processEmbeddingsBatchJob(makeJob('unexpected', {}, 'gemini-embeddings:reconciliation')),
    ).rejects.toThrow('Unknown reconciliation job type: unexpected')
    await expect(
      processEmbeddingsBatchJob(
        makeJob(
          'gemini-embeddings.reconcile_existing',
          { entityType: 'topics', after: '' },
          'gemini-embeddings:reconciliation',
        ),
      ),
    ).rejects.toThrow(UnrecoverableError)
    await expect(
      processEmbeddingsBatchJob(
        makeJob(
          'gemini-embeddings.reconcile_existing',
          {
            entityType: 'topics',
            after: encodeScopedUuidCursor(randomUUID(), 'embedding-reconciliation:posts:id-asc'),
          },
          'gemini-embeddings:reconciliation',
        ),
      ),
    ).rejects.toThrow(UnrecoverableError)
    await expect(
      processEmbeddingsBatchJob(
        makeJob(
          'gemini-embeddings.post_trigger_recovery',
          { after: '' },
          'gemini-embeddings:reconciliation',
        ),
      ),
    ).rejects.toThrow(UnrecoverableError)
  })
  it('runs the creation dispatcher branch through the real queue enqueues', async () => {
    await expect(
      processEmbeddingsBatchJob(
        makeJob('gemini-embeddings.creation_dispatcher', {}, 'gemini-embeddings:dispatcher'),
      ),
    ).resolves.toEqual({ batchesEnqueued: 5 })
  })

  it('routes owned polling and stale jobs through real processors and Vertex HTTP', async () => {
    const fixture = createVertexHttpFixture()
    const id = mintUUIDv7()
    const foreignId = mintUUIDv7()
    onTestFinished(() => cleanupTestEmbeddingsBatches([id, foreignId]))
    await insertTestEmbeddingsBatch({
      id,
      jobName: `projects/123456/locations/us/batchPredictionJobs/${id}`,
      submittedAt: new Date(Date.now() - 172_800_000),
    })
    await insertTestEmbeddingsBatch({
      id: foreignId,
      jobName: `projects/123456/locations/us/batchPredictionJobs/${foreignId}`,
      submittedAt: new Date(Date.now() - 172_800_000),
    })
    const before = await getTestBatchSummary(foreignId)
    const cursor = { afterId: uuidBefore(id), throughId: uuidAfter(id) }
    fixture.agent
      .get('https://us-aiplatform.googleapis.com')
      .intercept({
        method: 'GET',
        path: `/v1/projects/123456/locations/us/batchPredictionJobs/${id}`,
      })
      .reply(200, {
        name: `projects/123456/locations/us/batchPredictionJobs/${id}`,
        state: 'JOB_STATE_SUCCEEDED',
      })
    await fixture.run(async () => {
      await expect(
        processEmbeddingsBatchJob(
          makeJob(
            'gemini-embeddings.poll_batch',
            { batch_id: crypto.randomUUID() },
            'gemini-embeddings:polling',
          ),
        ),
      ).rejects.toThrow('Batch not found')
      await expect(
        processEmbeddingsBatchJob(
          makeJob('gemini-embeddings.poll_dispatcher', { cursor }, 'gemini-embeddings:dispatcher'),
        ),
      ).resolves.toEqual({ count: 1, hasMore: false })
      await expect(
        processEmbeddingsBatchJob(
          makeJob(
            'gemini-embeddings.stale_cleanup_dispatcher',
            { cursor },
            'gemini-embeddings:dispatcher',
          ),
        ),
      ).resolves.toMatchObject({
        inspected: 1,
        reconciled: 1,
        hasMore: false,
        forcedCancellations: [],
      })
    })
    expect(await getTestBatchSummary(id)).toMatchObject({ status: 'submitted' })
    expect(await getTestBatchSummary(foreignId)).toEqual(before)
  })

  it('rejects malformed and unknown jobs through the retry handler', async () => {
    await expect(
      processEmbeddingsBatchJob(
        makeJob('gemini-embeddings.poll_batch', {}, 'gemini-embeddings:polling'),
      ),
    ).rejects.toThrow('Batch ID is required')

    await expect(
      processEmbeddingsBatchJob(makeJob('unexpected', {}, 'gemini-embeddings:polling')),
    ).rejects.toThrow('Unknown polling job type: unexpected')

    await expect(
      processEmbeddingsBatchJob(makeJob('unexpected', {}, 'gemini-embeddings:dispatcher')),
    ).rejects.toThrow('Unknown dispatcher job type: unexpected')

    await expect(processEmbeddingsBatchJob(makeJob('unexpected', {}, 'unknown'))).rejects.toThrow(
      'Unknown ordering key: unknown',
    )
    await expect(
      processEmbeddingsBatchJob({ data: {}, name: 'unexpected', opts: {} } as Job<
        Record<string, unknown>
      >),
    ).rejects.toThrow('Unknown ordering key: undefined')
  })
})

function makeJob(
  name: string,
  data: Record<string, unknown>,
  orderingKey: string,
): Job<Record<string, unknown>> {
  return { data, name, opts: { ordering: { key: orderingKey } } } as Job<Record<string, unknown>>
}

async function blockBatchCreation(): Promise<void> {
  overrideDynamicConfigFieldsForTest(geminiEmbeddingsBatchConfig, { max_inflight_jobs: 1 })
  const id = mintUUIDv7()
  onTestFinished(() => cleanupTestEmbeddingsBatches([id]))
  await insertTestEmbeddingsBatch({
    id,
    jobType: 'posts',
    vertexState: 'JOB_STATE_PENDING',
  })
}
