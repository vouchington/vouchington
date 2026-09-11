import { describe, it, expect, vi, afterEach } from 'vitest'

import { createContext, use } from 'react'

import { render, screen, fireEvent, waitFor } from '@testing-library/react'

import { TagAutocomplete } from '../../tag-autocomplete'

// Mock Popover components to avoid portal/DOM issues in tests.
// PopoverContent reads open state from context so visibility is correct
// regardless of component render order.
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

import { fetchPosts } from '@/lib/api/client/posts'

import { fetchUrls } from '@/lib/api/client/urls'

const mockFetchTopics = vi.mocked(fetchTopics)

const mockFetchPosts = vi.mocked(fetchPosts)

const mockFetchUrls = vi.mocked(fetchUrls)

const AUTOCOMPLETE_WAIT_TIMEOUT = 2000

const topicResult = {
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

const postResult = {
  id: 'post-1',
  title: 'Best credit card for travel',
  post_type: 'discussion' as const,
  markdown: '',
  root_id: null,
  created_by_id: null,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
  deleted_at: null,
  deleted_by_id: null,
  archived_at: null,
  archived_by_id: null,
  broadcast: 'everyone' as const,
  privacy: 'public' as const,
  is_anonymous: false,

  community_id: null,

  clearance_status: 'approved' as const,
}

describe('TagAutocomplete', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('searches posts and shows results', async () => {
    mockFetchPosts.mockResolvedValueOnce({
      posts: { 'post-1': postResult },
      results: [{ __entity_type: 'post', id: 'post-1', ranking: 1, search_vector_ts: null }],
      page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
      posts_metrics: {},
    })

    render(
      <TagAutocomplete
        objectType='post'
        onSelect={vi.fn<VitestLooseMock>()}
      />,
    )
    fireEvent.change(screen.getByPlaceholderText('Search posts...'), {
      target: { value: 'credit' },
    })

    await waitFor(() => expect(screen.getByText('Best credit card for travel')).toBeDefined(), {
      timeout: AUTOCOMPLETE_WAIT_TIMEOUT,
    })
  })

  it('excludes already-selected ids from topic results', async () => {
    mockFetchTopics.mockResolvedValueOnce({
      topics: {
        'topic-1': topicResult,
        'topic-2': { ...topicResult, id: 'topic-2', name: 'Amex Platinum' },
      },
      results: [
        {
          __entity_type: 'topic',
          id: 'topic-1',
          ranking: 1,
          name: 'Chase Sapphire Reserve',
          slug: 'chase-sapphire-reserve',
          topic_type: 'card',
        },
        {
          __entity_type: 'topic',
          id: 'topic-2',
          ranking: 2,
          name: 'Amex Platinum',
          slug: 'amex-platinum',
          topic_type: 'card',
        },
      ],
      page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
      topics_metrics: {},
    })

    render(
      <TagAutocomplete
        objectType='topic'
        excludeIds={['topic-1']}
        onSelect={vi.fn<VitestLooseMock>()}
      />,
    )
    fireEvent.change(screen.getByPlaceholderText('Search topics...'), {
      target: { value: 'card' },
    })

    await waitFor(() => expect(screen.getByText('Amex Platinum')).toBeDefined(), {
      timeout: AUTOCOMPLETE_WAIT_TIMEOUT,
    })
    expect(screen.queryByText('Chase Sapphire Reserve')).toBeNull()
  })
})
