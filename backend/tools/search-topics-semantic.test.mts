import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import searchTopicsSemanticTool from './search-topics-semantic.mts'
import {
  createTestTopic,
  createTestUser,
  makeNearbyEmbedding,
  makeRandomEmbedding,
  seedSearchEmbeddingCache,
} from '@voucha/test-helpers'
import { updateTopicEmbeddingData } from '@voucha/test-helpers/entities/topics/embeddings'

describe('search-topics-semantic tool', () => {
  it('has correct schema name', () => {
    expect(searchTopicsSemanticTool.schema.name).toBe('search_topics_semantic')
  })

  it('returns results and clamps limits', { timeout: 30_000 }, async () => {
    const query = `semantic topic search ${crypto.randomUUID()}`
    const queryEmbedding = makeRandomEmbedding()
    await seedSearchEmbeddingCache(query, queryEmbedding)

    const user = await createTestUser()
    const topicCount = 26

    await Promise.all(
      Array.from({ length: topicCount }, async (_, index) => {
        const topic = await createTestTopic({
          user,
          name: `Semantic topic ${query} ${index}`,
        })
        await updateTopicEmbeddingData({
          topicId: topic.id,
          inputSha256: createHash('sha256').update(`${query}:${index}`).digest(),
          embedding: makeNearbyEmbedding(queryEmbedding),
          tokens: 10,
        })
      }),
    )

    const executor = searchTopicsSemanticTool.function(user)

    const defaultLimitResult = await executor({ query })
    expect(defaultLimitResult.success).toBe(true)
    expect(defaultLimitResult.topics).toHaveLength(10)

    const clampedResult = await executor({ query, limit: 100 })
    expect(clampedResult.success).toBe(true)
    expect(clampedResult.topics).toHaveLength(25)
  })
})
