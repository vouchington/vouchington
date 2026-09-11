import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getRssFeeds,
  getTrendingRssFeeds,
  getTopicRssFeeds,
  getServerRssFeedCrawls,
  getServerRssFeedCrawl,
} from './rss-feeds'
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

describe('rss-feeds server api helpers', () => {
  beforeEach(() => {
    mockGet.mockReset()
    mockGet.mockResolvedValue(null)
  })

  describe('getRssFeeds', () => {
    it('calls serverApi.get with correct endpoint and options', async () => {
      const options = { searchParams: { limit: 10 } }
      await getRssFeeds(options)

      expect(mockGet).toHaveBeenCalledWith('/api/v1/rss-feeds', options)
    })

    it('calls serverApi.get with no options when called with defaults', async () => {
      await getRssFeeds()

      expect(mockGet).toHaveBeenCalledWith('/api/v1/rss-feeds', {})
    })
  })

  describe('getTrendingRssFeeds', () => {
    it('calls serverApi.get with correct endpoint and options', async () => {
      const options = { searchParams: { time_range: 'week' } }
      await getTrendingRssFeeds(options)

      expect(mockGet).toHaveBeenCalledWith('/api/v1/rss-feeds/trending', options)
    })

    it('calls serverApi.get with no options when called with defaults', async () => {
      await getTrendingRssFeeds()

      expect(mockGet).toHaveBeenCalledWith('/api/v1/rss-feeds/trending', {})
    })
  })

  describe('getTopicRssFeeds', () => {
    it('calls serverApi.get with topic id and no filters', async () => {
      mockGet.mockResolvedValue({ results: [] })
      await getTopicRssFeeds('topic-1')

      expect(mockGet).toHaveBeenCalledWith('/api/v1/rss-feeds', {
        searchParams: { topic: 'topic-1', enabled: undefined, discoverable: undefined },
      })
    })

    it('passes boolean enabled and discoverable filters', async () => {
      mockGet.mockResolvedValue({ results: [] })
      await getTopicRssFeeds('topic-1', { enabled: true, discoverable: false })

      expect(mockGet).toHaveBeenCalledWith('/api/v1/rss-feeds', {
        searchParams: { topic: 'topic-1', enabled: true, discoverable: false },
      })
    })

    it('converts null options to the string "null"', async () => {
      mockGet.mockResolvedValue({ results: [] })
      await getTopicRssFeeds('topic-1', { enabled: null, discoverable: null })

      expect(mockGet).toHaveBeenCalledWith('/api/v1/rss-feeds', {
        searchParams: { topic: 'topic-1', enabled: 'null', discoverable: 'null' },
      })
    })
  })

  describe('getServerRssFeedCrawls', () => {
    it('forwards cursor query options with encoded feed id', async () => {
      mockGet.mockResolvedValue({ results: [] })
      await getServerRssFeedCrawls('feed-42', { searchParams: { after: 'cursor-1', limit: 20 } })

      expect(mockGet).toHaveBeenCalledWith('/api/v1/rss-feeds/feed-42/crawls', {
        searchParams: { after: 'cursor-1', limit: 20 },
      })
    })

    it('encodes special characters in the feed id', async () => {
      mockGet.mockResolvedValue({ results: [] })
      await getServerRssFeedCrawls('feed/with/slashes')

      expect(mockGet).toHaveBeenCalledWith('/api/v1/rss-feeds/feed%2Fwith%2Fslashes/crawls', {})
    })
  })

  describe('getServerRssFeedCrawl', () => {
    it('calls serverApi.get with encoded feed id and crawl id', async () => {
      mockGet.mockResolvedValue({ crawl: {} })
      await getServerRssFeedCrawl('feed-42', 'crawl-1')

      expect(mockGet).toHaveBeenCalledWith('/api/v1/rss-feeds/feed-42/crawls/crawl-1')
    })

    it('encodes special characters in feed id and crawl id', async () => {
      mockGet.mockResolvedValue({ crawl: {} })
      await getServerRssFeedCrawl('feed/slashes', 'crawl/id')

      expect(mockGet).toHaveBeenCalledWith('/api/v1/rss-feeds/feed%2Fslashes/crawls/crawl%2Fid')
    })

    it('returns null when the crawl is not found', async () => {
      mockGet.mockRejectedValue(new ApiError('Not found', 404))

      const result = await getServerRssFeedCrawl('feed-42', 'missing')

      expect(result).toBeNull()
    })
  })
})
