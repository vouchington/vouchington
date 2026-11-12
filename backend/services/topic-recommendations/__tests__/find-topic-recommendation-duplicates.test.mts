import { createHash } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestTopic, makeNearbyEmbedding, makeRandomEmbedding } from '@voucha/test-helpers'
import { updateTopicEmbeddingData } from '@voucha/test-helpers/entities/topics'
import { findTopicRecommendationDuplicates } from '../find-topic-recommendation-duplicates.mts'
import * as geminiRequest from '../../embeddings/single/request.mts'

let queryEmbedding: number[]

async function seedTopicEmbedding(topicId: string): Promise<void> {
  await updateTopicEmbeddingData({
    topicId,
    inputSha256: createHash('sha256').update(`duplicates:${topicId}`).digest(),
    embedding: makeNearbyEmbedding(queryEmbedding),
    tokens: 10,
  })
}

describe('findTopicRecommendationDuplicates', () => {
  beforeEach(() => {
    queryEmbedding = makeRandomEmbedding()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  function stubEmbedding() {
    return vi
      .spyOn(geminiRequest, 'createEmbedding')
      .mockResolvedValue({ embedding: queryEmbedding, tokens: 5 })
  }

  it('populates similar_topics from semantic search results', async () => {
    stubEmbedding()
    const random = `similar-${crypto.randomUUID()}`
    const similarTopic = await createTestTopic()
    await seedTopicEmbedding(similarTopic.id)

    const result = await findTopicRecommendationDuplicates({
      topic_title: `My Topic ${random}`,
      topic_slug: `my-topic-${random}`,
    })

    expect(result.exact_topic).toBeNull()
    expect(result.similar_topics.filter(t => t.id === similarTopic.id)).toEqual([
      {
        id: similarTopic.id,
        name: similarTopic.name,
        slug: similarTopic.slug,
        topic_type: 'topic',
      },
    ])
  })

  it('excludes exact_topic from similar_topics', async () => {
    stubEmbedding()
    const topic = await createTestTopic()
    const otherTopic = await createTestTopic()
    await seedTopicEmbedding(topic.id)
    await seedTopicEmbedding(otherTopic.id)

    const result = await findTopicRecommendationDuplicates({
      topic_title: topic.name,
      topic_slug: topic.slug,
    })

    expect(result.exact_topic).toEqual({
      id: topic.id,
      name: topic.name,
      slug: topic.slug,
      topic_type: 'topic',
    })
    expect(result.similar_topics.filter(t => [topic.id, otherTopic.id].includes(t.id))).toEqual([
      {
        id: otherTopic.id,
        name: otherTopic.name,
        slug: otherTopic.slug,
        topic_type: 'topic',
      },
    ])
  })

  it('returns empty similar_topics when semantic search throws', async () => {
    vi.spyOn(geminiRequest, 'createEmbedding').mockRejectedValue(
      new Error('Gemini service unavailable'),
    )
    const random = `gemini-fail-${crypto.randomUUID()}`

    const result = await findTopicRecommendationDuplicates({
      topic_title: `Gemini Fail Topic ${random}`,
      topic_slug: `gemini-fail-topic-${random}`,
    })

    expect(result.similar_topics).toEqual([])
    expect(result.exact_topic).toBeNull()
  })
})
