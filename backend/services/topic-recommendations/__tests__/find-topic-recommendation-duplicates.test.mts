import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestTopic } from '@voucha/test-helpers'
import type { Topic } from '@services/topics/types'

const mockToolsSearchTopicsSemantic =
  vi.fn<
    (
      query: string,
      limit: number,
    ) => Promise<{ id: string; name: string; slug: string; topic_type: string }[]>
  >()

describe('findTopicRecommendationDuplicates', () => {
  beforeEach(() => {
    mockToolsSearchTopicsSemantic.mockReset()
  })

  it('populates similar_topics from semantic search results', async () => {
    const { findTopicRecommendationDuplicates } =
      await import('../find-topic-recommendation-duplicates.mts')
    const random = `similar-${Date.now()}`
    const fakeSimilarTopic = await createTestTopic()
    const fakeSimilarTopicResult = { ...fakeSimilarTopic, topic_type: 'topic' }

    mockToolsSearchTopicsSemantic.mockResolvedValueOnce([fakeSimilarTopicResult])

    const result = await findTopicRecommendationDuplicates(
      {
        topic_title: `My Topic ${random}`,
        topic_slug: `my-topic-${random}`,
      },
      {},
      {
        getTopicByAny: async () => null,
        toolsSearchTopicsSemantic: mockToolsSearchTopicsSemantic,
      },
    )

    expect(result.similar_topics).toHaveLength(1)
    expect(result.similar_topics[0]).toEqual(fakeSimilarTopicResult)
  })

  it('excludes exact_topic from similar_topics', async () => {
    const { findTopicRecommendationDuplicates } =
      await import('../find-topic-recommendation-duplicates.mts')
    const topic = await createTestTopic()

    const fakeSimilarTopic = {
      id: topic.id,
      name: topic.name,
      slug: topic.slug,
      topic_type: 'topic',
    }
    const otherTopic = await createTestTopic()
    const otherTopicResult = { ...otherTopic, topic_type: 'topic' }

    mockToolsSearchTopicsSemantic.mockResolvedValueOnce([fakeSimilarTopic, otherTopicResult])

    const result = await findTopicRecommendationDuplicates(
      {
        topic_title: topic.name,
        topic_slug: topic.slug,
      },
      {},
      {
        getTopicByAny: async slug => (slug === topic.slug ? (topic as unknown as Topic) : null),
        toolsSearchTopicsSemantic: mockToolsSearchTopicsSemantic,
      },
    )

    expect(result.exact_topic).not.toBeNull()
    expect(result.exact_topic?.id).toBe(topic.id)
    // The exact_topic should be excluded from similar_topics
    expect(result.similar_topics.every(t => t.id !== topic.id)).toBe(true)
    expect(result.similar_topics).toHaveLength(1)
    expect(result.similar_topics[0]?.id).toBe(otherTopic.id)
  })

  it('returns empty similar_topics when semantic search throws', async () => {
    const { findTopicRecommendationDuplicates } =
      await import('../find-topic-recommendation-duplicates.mts')
    const random = `bedrock-fail-${Date.now()}`

    mockToolsSearchTopicsSemantic.mockRejectedValueOnce(new Error('Bedrock service unavailable'))

    const result = await findTopicRecommendationDuplicates(
      {
        topic_title: `Bedrock Fail Topic ${random}`,
        topic_slug: `bedrock-fail-topic-${random}`,
      },
      {},
      {
        getTopicByAny: async () => null,
        toolsSearchTopicsSemantic: mockToolsSearchTopicsSemantic,
      },
    )

    expect(result.similar_topics).toHaveLength(0)
    expect(result.exact_topic).toBeNull()
  })
})
