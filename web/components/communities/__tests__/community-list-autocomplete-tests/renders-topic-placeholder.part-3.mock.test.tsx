import { describe, it, expect, vi, afterEach } from 'vitest'

import { createContext, use } from 'react'

import { render, screen, fireEvent, waitFor } from '@testing-library/react'

import { CommunityListAutocomplete } from '../../community-list-autocomplete'

// Mock Popover components to avoid portal/DOM issues in tests.
vi.mock(import('@/components/ui/popover'), () => {
  const PopoverContext = createContext(false)
  return {
    Popover: ({ children, open }: { children: React.ReactNode; open?: boolean }) => (
      <PopoverContext.Provider value={!!open}>{children}</PopoverContext.Provider>
    ),
    PopoverAnchor: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    PopoverContent: ({ children }: { children: React.ReactNode }) => {
      const open = use(PopoverContext)
      return open ? <div>{children}</div> : null
    },
  } as unknown as typeof import('@/components/ui/popover')
})

// Mock cmdk-based Command components to avoid ResizeObserver dependency
vi.mock(
  import('@/components/ui/command'),
  () =>
    ({
      Command: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
      CommandInput: ({
        placeholder,
        value,
        onValueChange,
        onFocus,
        onKeyDown,
        disabled,
      }: {
        placeholder?: string
        value?: string
        onValueChange?: (v: string) => void
        onFocus?: () => void
        onKeyDown?: (e: React.KeyboardEvent) => void
        disabled?: boolean
      }) => (
        <input
          placeholder={placeholder}
          aria-label={placeholder ?? 'Command search'}
          value={value}
          disabled={disabled}
          onChange={e => onValueChange?.(e.target.value)}
          onFocus={onFocus}
          onKeyDown={onKeyDown}
        />
      ),
      CommandList: ({ children }: { children: React.ReactNode }) => <ul>{children}</ul>,
      CommandEmpty: ({ children }: { children: React.ReactNode }) => (
        <li data-testid='command-empty'>{children}</li>
      ),
      CommandItem: ({
        children,
        onSelect,
      }: {
        children: React.ReactNode
        onSelect?: () => void
      }) => (
        <li>
          <button
            type='button'
            onClick={onSelect}
          >
            {children}
          </button>
        </li>
      ),
    }) as unknown as typeof import('@/components/ui/command'),
)

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

import { fetchTopics } from '@/lib/api/client/topics'

import { searchRssFeedsClient } from '@/lib/api/client/rss-feeds'

const mockFetchTopics = vi.mocked(fetchTopics)

const mockSearchRssFeeds = vi.mocked(searchRssFeedsClient)

const AUTOCOMPLETE_WAIT_TIMEOUT = 2000

const baseTopic = {
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
  created_by: { id: 'user-1', display_name: null, display_name_url_id: null },
  updated_by: { id: 'user-1', display_name: null, display_name_url_id: null },
}

const baseRssFeed = {
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

describe('CommunityListAutocomplete', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('calls onSelect with topic id when topic is clicked', async () => {
    mockFetchTopics.mockResolvedValueOnce({
      topics: { 'topic-1': baseTopic },
      results: [
        {
          __entity_type: 'topic',
          id: 'topic-1',
          ranking: 1,
          name: 'Chase Sapphire Reserve',
          slug: 'chase-sapphire-reserve',
          topic_type: 'card',
        },
      ],
      page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
      topics_metrics: {},
    })

    const handleSelect = vi.fn<VitestLooseMock>()
    render(
      <CommunityListAutocomplete
        itemType='topic'
        onSelect={handleSelect}
      />,
    )
    fireEvent.change(screen.getByPlaceholderText('Search topics...'), {
      target: { value: 'chase' },
    })
    await waitFor(() => expect(screen.getByText('Chase Sapphire Reserve')).toBeDefined(), {
      timeout: AUTOCOMPLETE_WAIT_TIMEOUT,
    })
    fireEvent.click(screen.getByText('Chase Sapphire Reserve'))
    expect(handleSelect).toHaveBeenCalledWith('topic-1')
  })

  it('searches rss feeds and shows results', async () => {
    mockSearchRssFeeds.mockResolvedValueOnce([baseRssFeed])

    render(
      <CommunityListAutocomplete
        itemType='rss_feed'
        onSelect={vi.fn<VitestLooseMock>()}
      />,
    )
    fireEvent.change(screen.getByPlaceholderText('Search sources...'), {
      target: { value: 'points' },
    })

    await waitFor(() => expect(screen.getByText('The Points Guy')).toBeDefined(), {
      timeout: AUTOCOMPLETE_WAIT_TIMEOUT,
    })
  })
})
