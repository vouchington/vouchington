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
vi.mock(import('@/lib/api/client/fediverse'), () => ({
  fetchFediverseSearch: vi.fn<VitestLooseMock>(),
}))

import { fetchTopics } from '@/lib/api/client/topics'
import { fetchPosts } from '@/lib/api/client/posts'
import { fetchRssFeedItems } from '@/lib/api/client/rss-feed-items'
import { fetchHostnames } from '@/lib/api/client/hostnames'
import { fetchCommunities } from '@/lib/api/client/communities'
import { fetchFediverseSearch } from '@/lib/api/client/fediverse'
import {
  makeCommunitiesSearchResponse,
  makeCommunity,
  makeRssFeedItem,
  makeRssFeedItemsFeedResponse,
  makeTopic,
  makeTopicsSearchResponse,
} from '@/test-helpers/api-responses'
import {
  searchAll,
  searchCommunitiesOnly,
  searchDomainsOnly,
  searchFediverseOnly,
  searchNewsOnly,
  searchPostsOnly,
  searchTopicsOnly,
} from './command-search-data-search'
import { searchByTab } from './command-search-data'

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

const mockFetchTopics = vi.mocked(fetchTopics) as unknown as AnyMock & {
  mockResolvedValueOnce: AnyMock
}
const mockFetchPosts = vi.mocked(fetchPosts) as unknown as AnyMock & {
  mockResolvedValueOnce: AnyMock
}
const mockFetchRssFeedItems = vi.mocked(fetchRssFeedItems) as unknown as AnyMock & {
  mockResolvedValueOnce: AnyMock
}
const mockFetchHostnames = vi.mocked(fetchHostnames) as unknown as AnyMock & {
  mockResolvedValueOnce: AnyMock
}
const mockFetchCommunities = vi.mocked(fetchCommunities) as unknown as AnyMock & {
  mockResolvedValueOnce: AnyMock
}
const mockFetchFediverseSearch = vi.mocked(fetchFediverseSearch) as unknown as AnyMock & {
  mockResolvedValueOnce: AnyMock
}

describe('search functions', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('searchAll', () => {
    it('fetches all entity types in parallel and returns extracted results', async () => {
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

      const result = await searchAll('test', signal)

      expect(result.topics).toEqual([topic])
      expect(result.posts).toEqual([post])
      expect(result.news).toEqual([rssItem])
      expect(result.domains).toEqual([hostname])
      expect(result.communities).toEqual([community])
    })
  })

  describe('searchTopicsOnly', () => {
    it('fetches topics with limit 5 and returns only topics', async () => {
      mockFetchTopics.mockResolvedValueOnce(makeTopicsSearchResponse({ topics: [topic] }))

      const result = await searchTopicsOnly('test', signal)

      expect(result.topics).toEqual([topic])
      expect(result.communities).toEqual([])
    })
  })

  describe('searchPostsOnly', () => {
    it('fetches posts with limit 5 and returns only posts', async () => {
      mockFetchPosts.mockResolvedValueOnce({
        results: [{ id: 'post-1' }],
        posts: { 'post-1': post },
        page_info: { has_next_page: false },
      })

      const result = await searchPostsOnly('test', signal)

      expect(result.posts).toEqual([post])
      expect(result.topics).toEqual([])
    })
  })

  describe('searchNewsOnly', () => {
    it('fetches rss feed items with limit 5 and returns only news', async () => {
      mockFetchRssFeedItems.mockResolvedValueOnce(
        makeRssFeedItemsFeedResponse({ rssFeedItems: [rssItem] }),
      )

      const result = await searchNewsOnly('test', signal)

      expect(result.news).toEqual([rssItem])
      expect(result.topics).toEqual([])
    })
  })

  describe('searchDomainsOnly', () => {
    it('fetches hostnames with limit 5 and returns only domains', async () => {
      mockFetchHostnames.mockResolvedValueOnce({
        results: [{ id: 'domain-1' }],
        hostnames: { 'domain-1': hostname },
        page_info: { has_next_page: false },
      })

      const result = await searchDomainsOnly('test', signal)

      expect(result.domains).toEqual([hostname])
      expect(result.topics).toEqual([])
    })
  })

  describe('searchCommunitiesOnly', () => {
    it('fetches communities with limit 5 and returns only communities', async () => {
      mockFetchCommunities.mockResolvedValueOnce(
        makeCommunitiesSearchResponse({ communities: [community] }),
      )

      const result = await searchCommunitiesOnly('test', signal)

      expect(result.communities).toEqual([community])
      expect(result.topics).toEqual([])
    })
  })

  describe('searchFediverseOnly', () => {
    it('fetches Fediverse buckets with limit 5 and flattens items', async () => {
      const item = {
        id: 'fediverse-1',
        provider: 'peertube',
        result_type: 'video',
        external_url: 'https://videos.example/watch/1',
        title: 'Test Video',
        source_hostname: 'videos.example',
      }
      mockFetchFediverseSearch.mockResolvedValueOnce({
        buckets: [{ provider: 'peertube', status: 'ok', items: [item] }],
      })

      const result = await searchFediverseOnly('test', signal)

      expect(mockFetchFediverseSearch).toHaveBeenCalledWith({ q: 'test', limit: 5, signal })
      expect(result.fediverse).toEqual([item])
      expect(result.topics).toEqual([])
    })
  })

  describe('searchByTab communities case', () => {
    it('delegates to searchCommunitiesOnly for communities tab', async () => {
      mockFetchCommunities.mockResolvedValueOnce(
        makeCommunitiesSearchResponse({ communities: [community] }),
      )

      const result = await searchByTab('test', 'communities', signal)

      expect(result.communities).toEqual([community])
      expect(result.topics).toEqual([])
    })
  })

  describe('searchByTab fediverse case', () => {
    it('delegates to searchFediverseOnly for fediverse tab', async () => {
      const item = {
        id: 'fediverse-1',
        provider: 'mastodon',
        result_type: 'post',
        external_url: 'https://social.example/@alice/1',
        title: 'Test Post',
        source_hostname: 'social.example',
      }
      mockFetchFediverseSearch.mockResolvedValueOnce({
        buckets: [{ provider: 'mastodon', status: 'ok', items: [item] }],
      })

      const result = await searchByTab('test', 'fediverse', signal)

      expect(result.fediverse).toEqual([item])
      expect(result.topics).toEqual([])
    })
  })
})
