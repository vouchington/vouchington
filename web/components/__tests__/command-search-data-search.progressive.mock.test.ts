import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock(import('@/lib/api/client/topics'), () => ({
  fetchTopics: vi.fn<VitestLooseMock>(),
}))
vi.mock(import('@/lib/api/client/posts'), () => ({
  fetchPosts: vi.fn<VitestLooseMock>(),
}))
vi.mock(import('@/lib/api/client/rss-feed-items'), () => ({
  fetchRssFeedItems: vi.fn<VitestLooseMock>(),
}))
vi.mock(import('@/lib/api/client/hostnames'), () => ({
  fetchHostnames: vi.fn<VitestLooseMock>(),
}))
vi.mock(import('@/lib/api/client/communities'), () => ({
  fetchCommunities: vi.fn<VitestLooseMock>(),
}))

import { fetchTopics } from '@/lib/api/client/topics'
import { fetchPosts } from '@/lib/api/client/posts'
import { fetchRssFeedItems } from '@/lib/api/client/rss-feed-items'
import { fetchHostnames } from '@/lib/api/client/hostnames'
import { fetchCommunities } from '@/lib/api/client/communities'
import {
  makeCommunitiesSearchResponse,
  makeCommunity,
  makeRssFeedItem,
  makeRssFeedItemsFeedResponse,
  makeTopic,
  makeTopicsSearchResponse,
} from '@/test-helpers/api-responses'
import { searchAll, searchAllProgressive } from '../command-search-data-search'

const signal = new AbortController().signal

const topic = makeTopic({ id: 'topic-1', name: 'Test Topic' })
const post = { id: 'post-1', title: 'Test Post' }
const rssItem = makeRssFeedItem({ id: 'news-1', data: { title: 'Test News' } })
const hostname = { id: 'domain-1', hostname: 'example.com' }
const community = makeCommunity({
  id: 'community-1',
  name: 'Test Community',
  slug: 'test-community',
})

type AnyMock = (val: any) => any
type MockFn = AnyMock & { mockResolvedValueOnce: AnyMock; mockRejectedValueOnce: AnyMock }
const mockFetchTopics = vi.mocked(fetchTopics) as unknown as MockFn
const mockFetchPosts = vi.mocked(fetchPosts) as unknown as MockFn
const mockFetchRssFeedItems = vi.mocked(fetchRssFeedItems) as unknown as MockFn
const mockFetchHostnames = vi.mocked(fetchHostnames) as unknown as MockFn
const mockFetchCommunities = vi.mocked(fetchCommunities) as unknown as MockFn

describe('progressive fan-out', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('searchAll — allSettled partial failure', () => {
    it('returns empty slice for a failing vertical, keeps other four', async () => {
      // Topics fetch throws a network error
      mockFetchTopics.mockRejectedValueOnce(new Error('network error'))
      mockFetchPosts.mockResolvedValueOnce({
        results: [{ id: 'post-1' }],
        posts: { 'post-1': post },
        page_info: { has_next_page: false },
      })
      mockFetchRssFeedItems.mockResolvedValueOnce(
        makeRssFeedItemsFeedResponse({ rssFeedItems: [rssItem] }),
      )
      mockFetchHostnames.mockResolvedValueOnce({
        results: [{ id: 'domain-1' }],
        hostnames: { 'domain-1': hostname },
        page_info: { has_next_page: false },
      })
      mockFetchCommunities.mockResolvedValueOnce(
        makeCommunitiesSearchResponse({ communities: [community] }),
      )

      const result = await searchAll('test', signal)

      // Failing vertical degrades to empty
      expect(result.topics).toEqual([])
      // Other four verticals still return their results
      expect(result.posts).toEqual([post])
      expect(result.news).toEqual([rssItem])
      expect(result.domains).toEqual([hostname])
      expect(result.communities).toEqual([community])
    })
  })

  describe('searchAllProgressive', () => {
    it('calls onVertical for each settled vertical', async () => {
      mockFetchTopics.mockResolvedValueOnce(makeTopicsSearchResponse({ topics: [topic] }))
      mockFetchPosts.mockResolvedValueOnce({
        results: [{ id: 'post-1' }],
        posts: { 'post-1': post },
        page_info: { has_next_page: false },
      })
      mockFetchRssFeedItems.mockResolvedValueOnce(
        makeRssFeedItemsFeedResponse({ rssFeedItems: [rssItem] }),
      )
      mockFetchHostnames.mockResolvedValueOnce({
        results: [{ id: 'domain-1' }],
        hostnames: { 'domain-1': hostname },
        page_info: { has_next_page: false },
      })
      mockFetchCommunities.mockResolvedValueOnce(
        makeCommunitiesSearchResponse({ communities: [community] }),
      )

      const onVertical = vi.fn<(partial: Record<string, unknown>) => void>()
      await searchAllProgressive('test', signal, onVertical)

      expect(onVertical).toHaveBeenCalledTimes(5)
      // Each call covers exactly one vertical key
      const keys = onVertical.mock.calls.flatMap(args => Object.keys(args[0]))
      expect(keys).toContain('topics')
      expect(keys).toContain('posts')
      expect(keys).toContain('news')
      expect(keys).toContain('domains')
      expect(keys).toContain('communities')
    })

    it('does not call onVertical for a failing vertical', async () => {
      mockFetchTopics.mockRejectedValueOnce(new Error('topics failure'))
      mockFetchPosts.mockResolvedValueOnce({
        results: [{ id: 'post-1' }],
        posts: { 'post-1': post },
        page_info: { has_next_page: false },
      })
      mockFetchRssFeedItems.mockResolvedValueOnce(
        makeRssFeedItemsFeedResponse({ rssFeedItems: [] }),
      )
      mockFetchHostnames.mockResolvedValueOnce({
        results: [],
        hostnames: {},
        page_info: { has_next_page: false },
      })
      mockFetchCommunities.mockResolvedValueOnce(makeCommunitiesSearchResponse({ communities: [] }))

      const onVertical = vi.fn<(partial: Record<string, unknown>) => void>()
      await searchAllProgressive('test', signal, onVertical)

      // topics failed → onVertical called only 4 times (not for topics)
      expect(onVertical).toHaveBeenCalledTimes(4)
      const keys = onVertical.mock.calls.flatMap(args => Object.keys(args[0]))
      expect(keys).not.toContain('topics')
    })

    it('does not call onVertical when signal is already aborted', async () => {
      // Pre-abort the controller before calling searchAllProgressive
      const controller = new AbortController()
      controller.abort()

      mockFetchTopics.mockResolvedValueOnce(makeTopicsSearchResponse({ topics: [topic] }))
      mockFetchPosts.mockResolvedValueOnce({
        results: [],
        posts: {},
        page_info: { has_next_page: false },
      })
      mockFetchRssFeedItems.mockResolvedValueOnce(
        makeRssFeedItemsFeedResponse({ rssFeedItems: [] }),
      )
      mockFetchHostnames.mockResolvedValueOnce({
        results: [],
        hostnames: {},
        page_info: { has_next_page: false },
      })
      mockFetchCommunities.mockResolvedValueOnce(makeCommunitiesSearchResponse({ communities: [] }))

      const onVertical = vi.fn<(partial: Record<string, unknown>) => void>()
      await searchAllProgressive('test', controller.signal, onVertical)

      // Aborted before any settle — no callbacks should fire
      expect(onVertical).not.toHaveBeenCalled()
    })
  })
})
