import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getPublisherTypes,
  getUserTags,
  getTopic,
  getTopicAliases,
  getTopicAdditionalHostnames,
  getTopicSpendingCategoryAttributes,
  getTopicTypeAttributesServer,
} from './topics'
import { ApiError } from '../error'

const { mockGet } = vi.hoisted(() => ({
  mockGet: vi.fn<VitestLooseMock>(),
}))

vi.mock(
  import('./instance'),
  () =>
    ({
      serverApi: {
        get: mockGet,
      },
    }) as unknown as typeof import('./instance'),
)

describe('topics server api helpers', () => {
  beforeEach(() => {
    mockGet.mockReset()
    mockGet.mockResolvedValue(null)
  })

  describe('getTopic', () => {
    it('returns null for a missing topic', async () => {
      mockGet.mockRejectedValue(new ApiError('Not found', 404))

      await expect(getTopic('missing-topic')).resolves.toBeNull()
    })

    it('propagates forbidden topic responses so Next.js can render a 403', async () => {
      const error = new ApiError('Forbidden', 403)
      mockGet.mockRejectedValue(error)

      await expect(getTopic('private-topic')).rejects.toBe(error)
    })
  })

  describe('getTopicAliases', () => {
    it('calls serverApi.get with the correct endpoint', async () => {
      mockGet.mockResolvedValue({
        results: ['alias-a', 'alias-b'],
        alias_records: [
          { id: 'alias-id-a', alias: 'alias-a' },
          { id: 'alias-id-b', alias: 'alias-b' },
        ],
      })
      const result = await getTopicAliases('topic-1')

      expect(mockGet).toHaveBeenCalledWith('/api/v1/topics/topic-1/aliases')
      expect(result).toEqual({
        results: [
          { id: 'alias-id-a', alias: 'alias-a' },
          { id: 'alias-id-b', alias: 'alias-b' },
        ],
        alias_records: [
          { id: 'alias-id-a', alias: 'alias-a' },
          { id: 'alias-id-b', alias: 'alias-b' },
        ],
      })
    })

    it('encodes special characters in the topic id', async () => {
      mockGet.mockResolvedValue({ results: [], alias_records: [] })
      await getTopicAliases('topic/with/slashes')

      expect(mockGet).toHaveBeenCalledWith('/api/v1/topics/topic%2Fwith%2Fslashes/aliases')
    })
  })

  describe('getTopicAdditionalHostnames', () => {
    it('calls serverApi.get with the correct endpoint', async () => {
      mockGet.mockResolvedValue({ results: [] })
      await getTopicAdditionalHostnames('topic-1')

      expect(mockGet).toHaveBeenCalledWith('/api/v1/topics/topic-1/additional-hostnames')
    })
  })

  describe('getTopicSpendingCategoryAttributes', () => {
    it('calls serverApi.get with the correct endpoint', async () => {
      const data = { spending_category_attributes: { default_spending_frequency: 'monthly' } }
      mockGet.mockResolvedValue(data)
      const result = await getTopicSpendingCategoryAttributes('topic-1')

      expect(mockGet).toHaveBeenCalledWith('/api/v1/topics/topic-1/spending-category')
      expect(result).toEqual(data)
    })
  })

  describe('getTopicTypeAttributesServer', () => {
    it('returns the value for the correct type key', async () => {
      const attrs = { name: 'My Attr' }
      mockGet.mockResolvedValue({ bank_account_attributes: attrs })
      const result = await getTopicTypeAttributesServer('topic-1', 'bank-account')

      expect(mockGet).toHaveBeenCalledWith('/api/v1/topics/topic-1/bank-account')
      expect(result).toEqual(attrs)
    })

    it('throws when the expected key is missing from the response', async () => {
      mockGet.mockResolvedValue({ wrong_key: {} })

      // Use distinct args to avoid React.cache returning a memoized result from the prior test
      await expect(getTopicTypeAttributesServer('topic-2', 'bank-account')).rejects.toThrow(
        'Missing key "bank_account_attributes" in topic type attributes response',
      )
    })

    it('replaces hyphens with underscores in the type key', async () => {
      const attrs = { level: 1 }
      mockGet.mockResolvedValue({ credit_card_attributes: attrs })
      const result = await getTopicTypeAttributesServer('topic-1', 'credit-card')

      expect(result).toEqual(attrs)
    })
  })

  describe('getPublisherTypes', () => {
    it('calls serverApi.get with the publisher types endpoint', async () => {
      const data = { publisher_types: [{ id: 'publisher-blog', slug: 'blog', label: 'Blog' }] }
      mockGet.mockResolvedValue(data)
      const result = await getPublisherTypes()

      expect(mockGet).toHaveBeenCalledWith('/api/v1/topics/publisher-types')
      expect(result).toEqual(data)
    })
  })

  describe('getUserTags', () => {
    it('calls serverApi.get with the user tags endpoint', async () => {
      const data = { user_tags: [{ id: 'bot-topic', slug: 'bot', label: 'Bot' }] }
      mockGet.mockResolvedValue(data)
      const result = await getUserTags()

      expect(mockGet).toHaveBeenCalledWith('/api/v1/topics/user-tags')
      expect(result).toEqual(data)
    })
  })
})
