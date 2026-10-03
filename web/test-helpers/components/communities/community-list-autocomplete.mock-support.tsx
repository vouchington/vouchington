import { vi } from 'vitest'

import '@/test-helpers/components/shared/autocomplete-popover-command-mocks'

vi.mock(import('@/lib/api/client/topics'), () => ({
  fetchTopics: vi.fn<VitestLooseMock>().mockResolvedValue({
    topics: {},
    results: [],
    page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
    topics_metrics: {},
  }),
}))

vi.mock(import('@/lib/api/client/rss-feeds'), () => ({
  searchRssFeedsClient: vi.fn<VitestLooseMock>().mockResolvedValue([]),
}))

vi.mock(import('@/lib/api/client/posts'), () => ({
  fetchPosts: vi.fn<VitestLooseMock>().mockResolvedValue({
    posts: {},
    results: [],
    page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
    posts_metrics: {},
  }),
}))

vi.mock(import('@/lib/api/client/hostnames'), () => ({
  fetchHostnames: vi.fn<VitestLooseMock>().mockResolvedValue({
    results: [],
    hostnames: {},
    page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
  }),
}))

vi.mock(
  import('@/lib/api/client/urls'),
  () =>
    ({
      fetchUrls: vi.fn<VitestLooseMock>().mockResolvedValue({
        results: [],
        page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
      }),
    }) as unknown as typeof import('@/lib/api/client/urls'),
)

vi.mock(
  import('sonner'),
  () =>
    ({
      toast: { error: vi.fn<VitestLooseMock>(), success: vi.fn<VitestLooseMock>() },
    }) as unknown as typeof import('sonner'),
)

import { fetchHostnames } from '@/lib/api/client/hostnames'
import { fetchPosts } from '@/lib/api/client/posts'
import { searchRssFeedsClient } from '@/lib/api/client/rss-feeds'
import { fetchTopics } from '@/lib/api/client/topics'
import { fetchUrls } from '@/lib/api/client/urls'

export const mockFetchTopics = vi.mocked(fetchTopics)
export const mockSearchRssFeeds = vi.mocked(searchRssFeedsClient)
export const mockFetchPosts = vi.mocked(fetchPosts)
export const mockFetchHostnames = vi.mocked(fetchHostnames)
export const mockFetchUrls = vi.mocked(fetchUrls)
export const AUTOCOMPLETE_WAIT_TIMEOUT = 2000

export const baseTopic = {
  __entity_type: 'topic' as const,
  id: 'topic-1',
  name: 'Chase Sapphire Reserve',
  slug: 'chase-sapphire-reserve',
  markdown: '',
  aliases: [],
  topic_type: 'card' as const,
  noindex: false,
  allow_reviews: true,
  created_at: '2024-01-01T00:00:00Z',
  logo_image_id: null,
  hero_image_id: null,
  rewards_program_id: null,
  referral_program_id: null,
  created_by: { account_type: null, id: 'user-1', display_name: null, display_name_url_id: null },
  updated_by: { account_type: null, id: 'user-1', display_name: null, display_name_url_id: null },
}

export const baseRssFeed = {
  __entity_type: 'rss_feed' as const,
  id: 'feed-1',
  title: 'The Points Guy',
  is_enabled: true,
  is_discoverable: true,
  etag: null,
  last_modified_at: null,
  last_fetched_at: null,
  feed_type: 'article' as const,
  rss_feed_url: { id: 'url-1', url: 'https://thepointsguy.com/feed' },
  home_page_url: null,
  hostname: null,
  topic: { id: 'topic-2', name: 'Travel', slug: 'travel', topic_type: 'general' },
}
