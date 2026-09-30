import { describe, expect, it, vi, afterEach } from 'vitest'
import { createContext, use } from 'react'
import { render } from '@testing-library/react'
import { CommunityListAutocomplete } from '../community-list-autocomplete'

import { registerUrlMinLengthGuardCases } from '@/test-helpers/components/shared/url-min-length-guard-cases'

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
        'data-pw': dataPw,
      }: {
        placeholder?: string
        value?: string
        onValueChange?: (v: string) => void
        onFocus?: () => void
        onKeyDown?: (e: React.KeyboardEvent) => void
        disabled?: boolean
        'data-pw'?: string
      }) => (
        <input
          placeholder={placeholder}
          aria-label={placeholder ?? 'Command search'}
          value={value}
          disabled={disabled}
          data-pw={dataPw}
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
        'data-pw': dataPw,
      }: {
        children: React.ReactNode
        onSelect?: () => void
        'data-pw'?: string
      }) => (
        <li>
          <button
            type='button'
            data-pw={dataPw}
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

import { fetchUrls } from '@/lib/api/client/urls'
import { communityListItemTypeCatalog } from '@voucha/types/entities/community-list-item-type'

const mockFetchUrls = vi.mocked(fetchUrls)
const AUTOCOMPLETE_WAIT_TIMEOUT = 2000

describe('CommunityListAutocomplete URL min-length guard', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  registerUrlMinLengthGuardCases({
    renderControl: () =>
      render(
        <CommunityListAutocomplete
          itemType='url'
          onSelect={vi.fn<VitestLooseMock>()}
        />,
      ),
    placeholder: 'Search URLs...',
    clearedEmptyText: 'No URLs found.',
    mockFetch: mockFetchUrls,
    waitTimeout: AUTOCOMPLETE_WAIT_TIMEOUT,
  })

  it('labels the URL field from the item-type catalog', () => {
    expect(communityListItemTypeCatalog.url.searchLabel).toBe('URLs')
    const { container } = render(
      <CommunityListAutocomplete
        itemType='url'
        onSelect={vi.fn<VitestLooseMock>()}
      />,
    )
    expect(
      container.querySelector('[data-pw="community-list-autocomplete-input-url"]'),
    ).not.toBeNull()
  })
})
