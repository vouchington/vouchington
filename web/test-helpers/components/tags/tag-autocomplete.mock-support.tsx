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

vi.mock(import('@/lib/api/client/posts'), () => ({
  fetchPosts: vi.fn<VitestLooseMock>().mockResolvedValue({
    posts: {},
    results: [],
    page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
    posts_metrics: {},
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

import { fetchTopics } from '@/lib/api/client/topics'
import { fetchUrls } from '@/lib/api/client/urls'

export const mockFetchTopics = vi.mocked(fetchTopics)
export const mockFetchUrls = vi.mocked(fetchUrls)
export const AUTOCOMPLETE_WAIT_TIMEOUT = 2000

export const topicResult = {
  __entity_type: 'topic' as const,
  id: 'topic-1',
  name: 'Chase Sapphire Reserve',
  slug: 'chase-sapphire-reserve',
  markdown: '',
  aliases: [],
  topic_type: 'card' as const,
  is_noindexed: false,
  should_allow_reviews: true,
  created_at: '2024-01-01T00:00:00Z',
  logo_image_id: null,
  hero_image_id: null,
  rewards_program_id: null,
  referral_program_id: null,
  created_by: { account_type: null, id: 'user-1', display_name: null, display_name_url_id: null },
  updated_by: { account_type: null, id: 'user-1', display_name: null, display_name_url_id: null },
}
