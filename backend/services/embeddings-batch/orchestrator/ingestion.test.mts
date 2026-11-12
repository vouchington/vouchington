import { randomUUID } from 'node:crypto'
import { afterEach, describe, expect, it } from 'vitest'
import { mintUUIDv7 } from '@modules/utils/ids'
import { createTestTopic, makeRandomEmbedding } from '@voucha/test-helpers'
import {
  cleanupTestEmbeddingsBatches,
  getTestBatchEntities,
  getTestBatchSummary,
  insertTestEmbeddingsBatch,
} from '@voucha/test-helpers/entities/gemini-embeddings-batches'
import { getTopicEmbeddingData } from '@voucha/test-helpers/entities/topics/embeddings'
import {
  getBatchIngestionFailures,
  insertBatchTopicLock,
} from '@voucha/test-helpers/gemini-batch-ingestion'
import { applyTopicBatchUpdates } from '../entities/topics.mts'
import { completeBatchIngestion } from './poll.mts'
import { ingestBatchResults } from './ingestion.mts'

const batches: string[] = []
async function batch() {
  const id = mintUUIDv7()
  const topic = await createTestTopic({ name: `Ingestion ${randomUUID()}` })
  batches.push(id)
  await insertTestEmbeddingsBatch({
    id,
    vertexState: 'JOB_STATE_SUCCEEDED',
    completedAt: null,
  })
  await insertBatchTopicLock(id, topic.id)
  return { id, topicId: topic.id }
}

describe('durable batch ingestion', () => {
  afterEach(() => cleanupTestEmbeddingsBatches(batches.splice(0)))

  it('retries committed chunks idempotently before completing and releasing locks', async () => {
    const { id, topicId } = await batch()
    const content = (await getTopicEmbeddingData(topicId)) as {
      gemini_embedding_2_content_sha256: Buffer
    }
    const update = {
      entity_id: topicId,
      content_sha256: content.gemini_embedding_2_content_sha256,
      embedding: makeRandomEmbedding(),
      input_token_count: 17,
    }
    await expect(
      ingestBatchResults(id, async client => {
        await applyTopicBatchUpdates([update], client)
        throw new Error('synthetic interrupted later chunk')
      }),
    ).rejects.toThrow('interrupted later chunk')
    expect(await getBatchIngestionFailures(id)).toBe(1)
    expect(await getTestBatchEntities(id)).toHaveLength(1)
    await expect(
      ingestBatchResults(id, async client => {
        await applyTopicBatchUpdates([update], client)
        await completeBatchIngestion(id, client)
      }),
    ).resolves.toBe(true)
    expect(await getTopicEmbeddingData(topicId)).toMatchObject({
      gemini_embedding_2_input_sha256: update.content_sha256,
      gemini_embedding_2_input_token_count: 17,
    })
    expect(await getTestBatchSummary(id)).toMatchObject({ status: 'completed' })
    expect(await getTestBatchEntities(id)).toEqual([])
  })

  it('fences an abandoned download after a recovered delivery completes', async () => {
    const { id, topicId } = await batch()
    const started = Promise.withResolvers<void>()
    const resume = Promise.withResolvers<void>()
    const content = (await getTopicEmbeddingData(topicId)) as {
      gemini_embedding_2_content_sha256: Buffer
    }
    const first = ingestBatchResults(id, async fence => {
      started.resolve()
      await resume.promise
      await applyTopicBatchUpdates(
        [
          {
            entity_id: topicId,
            content_sha256: content.gemini_embedding_2_content_sha256,
            embedding: makeRandomEmbedding(),
            input_token_count: 19,
          },
        ],
        fence,
      )
      await completeBatchIngestion(id, fence)
    })
    await started.promise
    try {
      await expect(
        ingestBatchResults(id, fence => completeBatchIngestion(id, fence)),
      ).resolves.toBe(true)
    } finally {
      resume.resolve()
    }
    await expect(first).resolves.toBe(false)
    expect(await getTopicEmbeddingData(topicId)).toMatchObject({
      gemini_embedding_2_input_sha256: null,
    })
    expect(await getBatchIngestionFailures(id)).toBe(0)
    expect(await getTestBatchSummary(id)).toMatchObject({ status: 'completed' })
  })

  it('does not let an abandoned failing attempt count against its successor', async () => {
    const { id } = await batch()
    const started = Promise.withResolvers<void>()
    const resume = Promise.withResolvers<void>()
    const first = ingestBatchResults(id, async () => {
      started.resolve()
      await resume.promise
      throw new Error('synthetic abandoned download failure')
    })
    const rejected = first.catch((err: unknown) => err)
    await started.promise
    try {
      await expect(
        ingestBatchResults(id, fence => completeBatchIngestion(id, fence)),
      ).resolves.toBe(true)
    } finally {
      resume.resolve()
    }
    expect(await rejected).toMatchObject({ message: 'synthetic abandoned download failure' })
    expect(await getBatchIngestionFailures(id)).toBe(0)
    expect(await getTestBatchSummary(id)).toMatchObject({ status: 'completed' })
  })
})
