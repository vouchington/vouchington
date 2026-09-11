import { randomUUID } from 'node:crypto'
import { BedrockEmbeddingsClient } from '@modules/aws/bedrock-runtime'
import { UnrecoverableError } from '@modules/queue-errors'
import { insertCentralizedEmbeddingsBulk } from '../../centralized-table.mts'
import { createTopicEmbeddingContent } from '@voucha/types/entities/topic'
import {
  createTestBatch,
  createTestUserDirect,
  getTopicEmbeddingData,
  insertTestTopic,
} from '@voucha/test-helpers'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createSingleEmbedding } from '../index.mts'

describe('createSingleEmbedding', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('short-circuits when the entity is locked by a batch', async () => {
    const user = await createTestUserDirect()
    const suffix = randomUUID().slice(0, 8)
    const topicId = await insertTestTopic({
      name: `Single Embedding Lock ${suffix}`,
      slug: `single-embedding-lock-${suffix}`,
      createdById: user.id,
    })
    await createTestBatch({ entityIds: [topicId], jobType: 'topics' })

    await createSingleEmbedding({ type: 'topic', id: topicId, content: 'Locked topic content' })

    expect(await getTopicEmbeddingData(topicId)).toMatchObject({
      bedrock_nova_multimodal_v1_input_sha256: null,
    })
  })

  it('SQL-copies a centralized cache-hit vector onto the topic without toSql', async () => {
    const user = await createTestUserDirect()
    const suffix = randomUUID().slice(0, 8)
    const name = `Cache Hit ${suffix}`
    const { content, content_sha256 } = createTopicEmbeddingContent({ name })
    const topicId = await insertTestTopic({
      name,
      slug: `cache-hit-${suffix}`,
      createdById: user.id,
      embeddingSha256: `\\x${content_sha256.toString('hex')}`,
    })
    const embedding = new Array(1024).fill(0.25)
    await insertCentralizedEmbeddingsBulk([{ content_sha256, embedding, input_token_count: 4 }])

    await createSingleEmbedding({ type: 'topic', id: topicId, content })

    expect(await getTopicEmbeddingData(topicId)).toMatchObject({
      bedrock_nova_multimodal_v1_input_sha256: content_sha256,
      bedrock_nova_multimodal_v1_embedding: embedding,
    })
  })

  it('throws UnrecoverableError when Bedrock returns a non-array embedding', async () => {
    const user = await createTestUserDirect()
    const suffix = randomUUID().slice(0, 8)
    const name = `Bad Vector ${suffix}`
    const { content, content_sha256 } = createTopicEmbeddingContent({ name })
    const topicId = await insertTestTopic({
      name,
      slug: `bad-vector-${suffix}`,
      createdById: user.id,
      embeddingSha256: `\\x${content_sha256.toString('hex')}`,
    })
    const send = vi.fn<VitestLooseMock>().mockResolvedValueOnce({
      body: new TextEncoder().encode(JSON.stringify({ embedding: { float32: [0.1] } })),
    })
    Object.defineProperty(BedrockEmbeddingsClient, 'send', {
      value: send,
      configurable: true,
    })

    await expect(
      createSingleEmbedding({ type: 'topic', id: topicId, content }),
    ).rejects.toBeInstanceOf(UnrecoverableError)
    expect(await getTopicEmbeddingData(topicId)).toMatchObject({
      bedrock_nova_multimodal_v1_embedding: null,
    })
  })

  it('throws UnrecoverableError when Bedrock returns a length-matched non-numeric vector', async () => {
    const user = await createTestUserDirect()
    const suffix = randomUUID().slice(0, 8)
    const name = `Bad Element ${suffix}`
    const { content, content_sha256 } = createTopicEmbeddingContent({ name })
    const topicId = await insertTestTopic({
      name,
      slug: `bad-element-${suffix}`,
      createdById: user.id,
      embeddingSha256: `\\x${content_sha256.toString('hex')}`,
    })
    const embedding = new Array(1024).fill(0.25)
    embedding[0] = '0.25'
    const send = vi.fn<VitestLooseMock>().mockResolvedValueOnce({
      body: new TextEncoder().encode(JSON.stringify({ embedding })),
    })
    Object.defineProperty(BedrockEmbeddingsClient, 'send', {
      value: send,
      configurable: true,
    })

    await expect(
      createSingleEmbedding({ type: 'topic', id: topicId, content }),
    ).rejects.toBeInstanceOf(UnrecoverableError)
    expect(await getTopicEmbeddingData(topicId)).toMatchObject({
      bedrock_nova_multimodal_v1_embedding: null,
    })
  })

  it('writes a Bedrock dense vector onto the topic', async () => {
    const user = await createTestUserDirect()
    const suffix = randomUUID().slice(0, 8)
    const name = `Bedrock Hit ${suffix}`
    const { content, content_sha256 } = createTopicEmbeddingContent({ name })
    const topicId = await insertTestTopic({
      name,
      slug: `bedrock-hit-${suffix}`,
      createdById: user.id,
      embeddingSha256: `\\x${content_sha256.toString('hex')}`,
    })
    const embedding = new Array(1024).fill(0.25)
    const send = vi.fn<VitestLooseMock>().mockResolvedValueOnce({
      body: new TextEncoder().encode(JSON.stringify({ embedding, inputTokenCount: 5 })),
    })
    Object.defineProperty(BedrockEmbeddingsClient, 'send', {
      value: send,
      configurable: true,
    })

    await createSingleEmbedding({ type: 'topic', id: topicId, content })

    expect(await getTopicEmbeddingData(topicId)).toMatchObject({
      bedrock_nova_multimodal_v1_input_sha256: content_sha256,
      bedrock_nova_multimodal_v1_embedding: embedding,
    })
  })
})
