import { randomBytes, randomUUID } from 'node:crypto'
import { mintUUIDv7 } from '../../../modules/utils/ids.mts'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
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
import { processBedrockEmbeddingsBatchJob } from '../processors/worker-router.mts'
import { bedrockEmbeddingsBatchConfig } from '@services/bedrock-embeddings/batch/config'
import {
  overrideDynamicConfigFieldsForTest,
  closeScopedDynamicConfigContext,
} from '@voucha/test-helpers/dynamic-config'
import {
  cleanupTestEmbeddingsBatches,
  insertTestEmbeddingsBatch,
} from '@voucha/test-helpers/entities/bedrock-embeddings-batches'
const createdBatchIds: string[] = []

describe('bedrock embeddings batch worker processor', () => {
  beforeAll(async () => {
    await bedrockEmbeddingsBatchConfig.waitForInitialization()
    bedrockEmbeddingsBatchConfig.unsubscribe()
  })

  afterEach(async () => {
    overrideDynamicConfigFieldsForTest(bedrockEmbeddingsBatchConfig, {
      max_inflight_jobs: 100,
      max_requests_per_hour: 100000,
      max_requests_per_file: 100000,
      max_file_size_gb: 1,
      max_job_size_gb: 100,
      min_records_per_job: 100,
      backlog_threshold: 1000,
      stale_ttl_hours: 24,
    })
    await cleanupTestEmbeddingsBatches(createdBatchIds.splice(0))
  })

  afterAll(async () => {
    await closeScopedDynamicConfigContext([bedrockEmbeddingsBatchConfig])
  })

  it('reconciles a cached topic even when Bedrock creation is saturated', async () => {
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
    const embedding = new Array<number>(1024).fill(0.25)
    const foreignEmbedding = new Array<number>(1024).fill(0.5)
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

    const result = (await processBedrockEmbeddingsBatchJob(
      makeJob(
        'bedrock-embeddings.reconcile_existing',
        { entityType: 'topics', after },
        'bedrock-embeddings:reconciliation',
      ),
      { entityIds: [topicId] },
    )) as { updatedIds: string[]; scannedCount: number }
    expect(result.updatedIds).toEqual([topicId])
    expect(result.scannedCount).toBe(1)
    await expect(getTopicEmbeddingData(topicId)).resolves.toMatchObject({
      bedrock_nova_multimodal_v1_input_sha256: hash,
      bedrock_nova_multimodal_v1_embedding: embedding,
      bedrock_nova_multimodal_v1_embedding_created_at: expect.any(Date),
    })
    await expect(getTopicEmbeddingData(foreignTopicId)).resolves.toMatchObject({
      bedrock_nova_multimodal_v1_input_sha256: null,
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
        processBedrockEmbeddingsBatchJob(
          makeJob(
            'bedrock-embeddings.reconcile_existing',
            data,
            'bedrock-embeddings:reconciliation',
          ),
        ),
      ).rejects.toThrow(UnrecoverableError)
    }
    await expect(
      processBedrockEmbeddingsBatchJob(
        makeJob(
          'bedrock-embeddings.reconcile_existing',
          null as unknown as Record<string, unknown>,
          'bedrock-embeddings:reconciliation',
        ),
      ),
    ).rejects.toThrow(UnrecoverableError)
    await expect(
      processBedrockEmbeddingsBatchJob(
        makeJob('unexpected', {}, 'bedrock-embeddings:reconciliation'),
      ),
    ).rejects.toThrow('Unknown reconciliation job type: unexpected')
    await expect(
      processBedrockEmbeddingsBatchJob(
        makeJob(
          'bedrock-embeddings.reconcile_existing',
          { entityType: 'topics', after: '' },
          'bedrock-embeddings:reconciliation',
        ),
      ),
    ).rejects.toThrow(UnrecoverableError)
    await expect(
      processBedrockEmbeddingsBatchJob(
        makeJob(
          'bedrock-embeddings.reconcile_existing',
          {
            entityType: 'topics',
            after: encodeScopedUuidCursor(randomUUID(), 'embedding-reconciliation:posts:id-asc'),
          },
          'bedrock-embeddings:reconciliation',
        ),
      ),
    ).rejects.toThrow(UnrecoverableError)
    await expect(
      processBedrockEmbeddingsBatchJob(
        makeJob(
          'bedrock-embeddings.post_trigger_recovery',
          { after: '' },
          'bedrock-embeddings:reconciliation',
        ),
      ),
    ).rejects.toThrow(UnrecoverableError)
  })
  it('runs the creation dispatcher branch through the real queue enqueues', async () => {
    await expect(
      processBedrockEmbeddingsBatchJob(
        makeJob('bedrock-embeddings.creation_dispatcher', {}, 'bedrock-embeddings:dispatcher'),
      ),
    ).resolves.toEqual({ batchesEnqueued: 5 })
  })

  it('routes polling and dispatcher jobs through the real processors', async () => {
    await expect(
      processBedrockEmbeddingsBatchJob(
        makeJob(
          'bedrock-embeddings.poll_batch',
          { batch_id: crypto.randomUUID() },
          'bedrock-embeddings:polling',
        ),
      ),
    ).rejects.toThrow('Batch not found')

    await expect(
      processBedrockEmbeddingsBatchJob(
        makeJob('bedrock-embeddings.poll_dispatcher', {}, 'bedrock-embeddings:dispatcher'),
      ),
    ).resolves.toEqual({ count: expect.any(Number), hasMore: expect.any(Boolean) })

    await expect(
      processBedrockEmbeddingsBatchJob(
        makeJob('bedrock-embeddings.backlog_dispatcher', {}, 'bedrock-embeddings:dispatcher'),
      ),
    ).resolves.toMatchObject({ triggered: expect.any(Boolean) })

    await expect(
      processBedrockEmbeddingsBatchJob(
        makeJob('bedrock-embeddings.stale_cleanup_dispatcher', {}, 'bedrock-embeddings:dispatcher'),
      ),
    ).resolves.toEqual(expect.objectContaining({ inspected: expect.any(Number) }))
  })

  it('rejects malformed and unknown jobs through the retry handler', async () => {
    await expect(
      processBedrockEmbeddingsBatchJob(
        makeJob('bedrock-embeddings.poll_batch', {}, 'bedrock-embeddings:polling'),
      ),
    ).rejects.toThrow('Batch ID is required')

    await expect(
      processBedrockEmbeddingsBatchJob(makeJob('unexpected', {}, 'bedrock-embeddings:polling')),
    ).rejects.toThrow('Unknown polling job type: unexpected')

    await expect(
      processBedrockEmbeddingsBatchJob(makeJob('unexpected', {}, 'bedrock-embeddings:dispatcher')),
    ).rejects.toThrow('Unknown dispatcher job type: unexpected')

    await expect(
      processBedrockEmbeddingsBatchJob(makeJob('unexpected', {}, 'unknown')),
    ).rejects.toThrow('Unknown ordering key: unknown')
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
  overrideDynamicConfigFieldsForTest(bedrockEmbeddingsBatchConfig, { max_inflight_jobs: 1 })
  const id = mintUUIDv7()
  createdBatchIds.push(id)
  await insertTestEmbeddingsBatch({
    id,
    jobType: 'posts',
    bedrockStatus: 'Submitted',
  })
}
