import { lookupExistingEmbeddings } from '@services/embeddings/lookup'
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
import { insertBatchTopicMembership } from '@voucha/test-helpers/gemini-batch-ingestion'
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
  await insertBatchTopicMembership(id, topic.id)
  return { id, topicId: topic.id }
}

describe('durable batch ingestion', () => {
  afterEach(() => cleanupTestEmbeddingsBatches(batches.splice(0)))

  it('retries committed chunks idempotently before completing and removing membership', async () => {
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
      ingestBatchResults(
        id,
        async () => {
          await applyTopicBatchUpdates([update])
          throw new Error('synthetic interrupted later chunk')
        },
        false,
      ),
    ).rejects.toThrow('result ingestion failed')
    expect(await getTestBatchEntities(id)).toHaveLength(1)
    await ingestBatchResults(
      id,
      async () => {
        await applyTopicBatchUpdates([
          { ...update, embedding: update.embedding.map(value => -value), input_token_count: 91 },
        ])
        await completeBatchIngestion(id)
      },
      true,
    )
    const cached = (await lookupExistingEmbeddings([update.content_sha256])).get(
      update.content_sha256.toString('hex'),
    )!
    expect(await getTopicEmbeddingData(topicId)).toMatchObject({
      gemini_embedding_2_input_sha256: update.content_sha256,
      gemini_embedding_2_input_token_count: 17,
      gemini_embedding_2_embedding: cached.embedding,
    })
    expect(await getTestBatchSummary(id)).toMatchObject({ status: 'completed' })
    expect(await getTestBatchEntities(id)).toEqual([])
  })

  it('keeps membership until the final queue attempt and atomically fails then', async () => {
    const { id } = await batch()
    const fail = async () => {
      throw new Error('synthetic malformed result')
    }
    await expect(ingestBatchResults(id, fail, false)).rejects.toThrow('result ingestion failed')
    expect(await getTestBatchSummary(id)).toMatchObject({ status: 'in_progress' })
    expect(await getTestBatchEntities(id)).toHaveLength(1)
    await expect(ingestBatchResults(id, fail, true)).rejects.toThrow('result ingestion failed')
    expect(await getTestBatchSummary(id)).toMatchObject({ status: 'failed' })
    expect(await getTestBatchEntities(id)).toEqual([])
  })

  it('does not overwrite completion when another final attempt fails', async () => {
    const { id } = await batch()
    const started = Promise.withResolvers<void>()
    const resume = Promise.withResolvers<void>()
    const failing = ingestBatchResults(
      id,
      async () => {
        started.resolve()
        await resume.promise
        throw new Error('synthetic delayed failure')
      },
      true,
    )
    const rejected = failing.catch((err: unknown) => err)
    await started.promise
    try {
      await completeBatchIngestion(id)
    } finally {
      resume.resolve()
    }
    expect(await rejected).toMatchObject({ message: 'Vertex batch result ingestion failed' })
    expect(await getTestBatchSummary(id)).toMatchObject({ status: 'completed' })
    expect(await getTestBatchEntities(id)).toEqual([])
  })
})
