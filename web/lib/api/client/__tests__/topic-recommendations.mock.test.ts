import { afterEach, describe, expect, it, vi } from 'vitest'
import { makeTopHashtagsResponse } from '@/test-helpers/api-responses'

vi.mock(
  import('../instance'),
  () =>
    ({
      clientApi: {
        get: vi.fn<VitestLooseMock>(),
        post: vi.fn<VitestLooseMock>(),
        patch: vi.fn<VitestLooseMock>(),
        delete: vi.fn<VitestLooseMock>(),
      },
    }) as unknown as typeof import('../instance'),
)

import { clientApi } from '../instance'
import {
  createTopicRecommendation,
  updateTopicRecommendation,
  fetchTopicRecommendations,
  approveTopicRecommendation,
  rejectTopicRecommendation,
  withdrawTopicRecommendation,
  fetchTopicRecommendationDuplicates,
  fetchTopHashtags,
} from '../topic-recommendations'

const mockGet = vi.mocked(clientApi.get)
const mockPost = vi.mocked(clientApi.post)
const mockPatch = vi.mocked(clientApi.patch)
const mockDelete = vi.mocked(clientApi.delete)

describe('topic-recommendations client', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('withdrawTopicRecommendation', () => {
    it('DELETEs the topic recommendation endpoint', async () => {
      mockDelete.mockResolvedValueOnce(undefined)

      await withdrawTopicRecommendation('recommendation-1')

      expect(mockDelete).toHaveBeenCalledWith('/api/v1/topic-recommendations/recommendation-1')
    })
  })

  describe('fetchTopicRecommendations', () => {
    it('GETs the topic recommendations endpoint with searchParams', async () => {
      mockGet.mockResolvedValueOnce({ posts: [], cursor: null })

      await fetchTopicRecommendations({ q: 'test', status: 'pending', limit: 10 })

      expect(mockGet).toHaveBeenCalledWith('/api/v1/topic-recommendations', {
        searchParams: {
          q: 'test',
          status: 'pending',
          limit: 10,
        },
        signal: undefined,
      })
    })

    it('GETs the endpoint with no options when called with no arguments', async () => {
      mockGet.mockResolvedValueOnce({ posts: [], cursor: null })

      await fetchTopicRecommendations()

      expect(mockGet).toHaveBeenCalledWith('/api/v1/topic-recommendations', {
        searchParams: {
          q: undefined,
          status: undefined,
          limit: undefined,
        },
        signal: undefined,
      })
    })
  })

  describe('fetchTopHashtags', () => {
    it('GETs the signed-in top-hashtag endpoint with the full cursor tuple token', async () => {
      mockGet.mockResolvedValueOnce(makeTopHashtagsResponse())

      await fetchTopHashtags({
        q: 'credit.cards',
        mapping: 'unlinked',
        after: 'cursor-token',
        limit: 10,
      })

      expect(mockGet).toHaveBeenCalledWith('/api/v1/topic-recommendations/top-hashtags', {
        searchParams: {
          q: 'credit.cards',
          mapping: 'unlinked',
          after: 'cursor-token',
          limit: 10,
        },
        signal: undefined,
      })
    })
  })

  describe('createTopicRecommendation', () => {
    it('POSTs to the topic recommendations endpoint with the data payload', async () => {
      const data = {
        title: 'My Recommendation',
        markdown: 'Rationale',
        topic_title: 'Topic',
        topic_slug: 'topic',
        topic_markdown: 'Description',
        topic_hostname: 'example.com',
        topic_hostnames: ['example.com'],
        topic_aliases: ['alias'],
      }
      mockPost.mockResolvedValueOnce({ post: {} })

      await createTopicRecommendation(data)

      expect(mockPost).toHaveBeenCalledWith('/api/v1/topic-recommendations', data, {
        headers: { 'Idempotency-Key': expect.any(String) },
      })
    })
  })

  describe('updateTopicRecommendation', () => {
    it('PATCHes the topic recommendation endpoint with data', async () => {
      const data = { topic_title: 'Updated Topic' }
      mockPatch.mockResolvedValueOnce({ post: {} })

      await updateTopicRecommendation('recommendation-1', data)

      expect(mockPatch).toHaveBeenCalledWith('/api/v1/topic-recommendations/recommendation-1', data)
    })
  })

  describe('approveTopicRecommendation', () => {
    it('POSTs to the approvals sub-endpoint with an empty object', async () => {
      mockPost.mockResolvedValueOnce({ post: {}, topic_id: 'topic-1', topic_slug: 'topic-slug-1' })

      await approveTopicRecommendation('recommendation-1')

      expect(mockPost).toHaveBeenCalledWith(
        '/api/v1/topic-recommendations/recommendation-1/approvals',
        {},
      )
    })
  })

  describe('rejectTopicRecommendation', () => {
    it('POSTs to the rejections sub-endpoint with the reason', async () => {
      mockPost.mockResolvedValueOnce({ post: {} })

      await rejectTopicRecommendation('recommendation-1', 'Not relevant')

      expect(mockPost).toHaveBeenCalledWith(
        '/api/v1/topic-recommendations/recommendation-1/rejections',
        { reason: 'Not relevant' },
      )
    })

    it('POSTs with undefined reason when no reason is provided', async () => {
      mockPost.mockResolvedValueOnce({ post: {} })

      await rejectTopicRecommendation('recommendation-1')

      expect(mockPost).toHaveBeenCalledWith(
        '/api/v1/topic-recommendations/recommendation-1/rejections',
        { reason: undefined },
      )
    })
  })

  describe('fetchTopicRecommendationDuplicates', () => {
    it('GETs the duplicates endpoint with title, slug, and markdown params', async () => {
      const mockResult = {
        exact_topic: null,
        pending_recommendations: [],
        similar_topics: [],
      }
      mockGet.mockResolvedValueOnce(mockResult)

      const result = await fetchTopicRecommendationDuplicates({
        topic_title: 'My Topic',
        topic_slug: 'my-topic',
        topic_markdown: 'A description.',
      })

      expect(mockGet).toHaveBeenCalledWith('/api/v1/topic-recommendations/duplicates', {
        searchParams: {
          topic_title: 'My Topic',
          topic_slug: 'my-topic',
          topic_markdown: 'A description.',
        },
        signal: undefined,
      })
      expect(result).toBe(mockResult)
    })

    it('joins topic_aliases with commas when provided', async () => {
      mockGet.mockResolvedValueOnce({
        exact_topic: null,
        pending_recommendations: [],
        similar_topics: [],
      })

      await fetchTopicRecommendationDuplicates({
        topic_title: 'My Topic',
        topic_slug: 'my-topic',
        topic_aliases: ['alias-one', 'alias-two'],
      })

      expect(mockGet).toHaveBeenCalledWith('/api/v1/topic-recommendations/duplicates', {
        searchParams: {
          topic_title: 'My Topic',
          topic_slug: 'my-topic',
          topic_markdown: undefined,
          topic_aliases: 'alias-one,alias-two',
        },
        signal: undefined,
      })
    })

    it('omits topic_aliases param when the array is empty', async () => {
      mockGet.mockResolvedValueOnce({
        exact_topic: null,
        pending_recommendations: [],
        similar_topics: [],
      })

      await fetchTopicRecommendationDuplicates({
        topic_title: 'My Topic',
        topic_slug: 'my-topic',
        topic_aliases: [],
      })

      expect(mockGet).toHaveBeenCalledWith('/api/v1/topic-recommendations/duplicates', {
        searchParams: {
          topic_title: 'My Topic',
          topic_slug: 'my-topic',
          topic_markdown: undefined,
        },
        signal: undefined,
      })
    })
  })
})
