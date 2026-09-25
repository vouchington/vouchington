import { describe, it, expect, vi, afterEach } from 'vitest'

import { createContext, use } from 'react'

import { act, render, screen, fireEvent, waitFor } from '@testing-library/react'

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

import { fetchUrls } from '@/lib/api/client/urls'

const mockFetchUrls = vi.mocked(fetchUrls)

const AUTOCOMPLETE_WAIT_TIMEOUT = 2000

async function settleInitialQuery() {
  await act(async () => {})
}

describe('TagAutocomplete', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('calls onSelect with url id when url is clicked', async () => {
    mockFetchUrls.mockResolvedValueOnce({
      results: [
        {
          __entity_type: 'url',
          id: 'url-1',
          url: 'https://example.com/some/page',
          pathname: '/some/page',
          hostname: { id: 'h-1', hostname: 'example.com' },
        },
      ],
      page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
    })

    const handleSelect = vi.fn<VitestLooseMock>()
    render(
      <TagAutocomplete
        objectType='url'
        onSelect={handleSelect}
      />,
    )
    await settleInitialQuery()
    fireEvent.change(screen.getByPlaceholderText('Search urls...'), {
      target: { value: 'example' },
    })

    await waitFor(() => expect(screen.getByText('example.com/some/page')).toBeDefined(), {
      timeout: AUTOCOMPLETE_WAIT_TIMEOUT,
    })

    fireEvent.click(screen.getByText('example.com/some/page'))
    expect(handleSelect).toHaveBeenCalledWith('url-1')
  })

  it('disables input when disabled prop is true', () => {
    render(
      <TagAutocomplete
        objectType='topic'
        onSelect={vi.fn<VitestLooseMock>()}
        disabled
      />,
    )
    // The CommandInput mock renders an <input> with the disabled prop
    const input = screen.getByPlaceholderText('Search topics...')
    expect((input as HTMLInputElement).disabled).toBe(true)
  })
})
