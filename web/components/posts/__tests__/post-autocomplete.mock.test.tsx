import { describe, it, expect, vi, afterEach } from 'vitest'
import { createContext, use } from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { PostAutocomplete } from '../post-autocomplete'

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
      }: {
        placeholder?: string
        value?: string
        onValueChange?: (v: string) => void
        onFocus?: () => void
        onKeyDown?: (e: React.KeyboardEvent) => void
      }) => (
        <input
          placeholder={placeholder}
          aria-label={placeholder ?? 'Command search'}
          value={value}
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

vi.mock(import('@/lib/api/client/posts'), () => ({
  fetchPosts: vi.fn<VitestLooseMock>().mockResolvedValue({
    posts: {},
    results: [],
    posts_metrics: {},
    page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
  }),
}))

import { fetchPosts } from '@/lib/api/client/posts'

const mockFetchPosts = vi.mocked(fetchPosts)

describe('PostAutocomplete', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('renders the search input', () => {
    render(
      <PostAutocomplete
        value={null}
        label=''
        onChange={vi.fn<VitestLooseMock>()}
      />,
    )
    expect(screen.getByPlaceholderText('Search posts...')).toBeDefined()
  })

  it('shows provided label as initial value', () => {
    render(
      <PostAutocomplete
        value='post-1'
        label='My Post Title'
        onChange={vi.fn<VitestLooseMock>()}
      />,
    )
    const input = screen.getByPlaceholderText('Search posts...') as HTMLInputElement
    expect(input.value).toBe('My Post Title')
  })

  it('opens dropdown and shows empty state on input change', () => {
    render(
      <PostAutocomplete
        value={null}
        label=''
        onChange={vi.fn<VitestLooseMock>()}
      />,
    )
    const input = screen.getByPlaceholderText('Search posts...')
    fireEvent.change(input, { target: { value: 'my' } })
    expect(screen.getByTestId('command-empty')).toBeDefined()
  })

  it('shows post results after fetch', async () => {
    mockFetchPosts.mockResolvedValueOnce({
      posts: {
        'post-1': {
          id: 'post-1',
          title: 'Best Credit Cards 2024',
          post_type: 'review',
        } as never,
      },
      results: [{ id: 'post-1' }] as never,
      posts_metrics: {},
      page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
    })

    render(
      <PostAutocomplete
        value={null}
        label=''
        onChange={vi.fn<VitestLooseMock>()}
      />,
    )
    const input = screen.getByPlaceholderText('Search posts...')
    fireEvent.change(input, { target: { value: 'best' } })

    await waitFor(
      () => {
        expect(screen.getByText('Best Credit Cards 2024')).toBeDefined()
      },
      { timeout: 500 },
    )
  })

  it('calls onChange when a post is selected', async () => {
    mockFetchPosts.mockResolvedValueOnce({
      posts: {
        'post-1': {
          id: 'post-1',
          title: 'Best Credit Cards 2024',
          post_type: 'review',
        } as never,
      },
      results: [{ id: 'post-1' }] as never,
      posts_metrics: {},
      page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
    })

    const onPostSelect = vi.fn<VitestLooseMock>()
    render(
      <PostAutocomplete
        value={null}
        label=''
        onChange={onPostSelect}
      />,
    )
    const input = screen.getByPlaceholderText('Search posts...')
    fireEvent.change(input, { target: { value: 'best' } })

    await waitFor(
      () => {
        expect(screen.getByText('Best Credit Cards 2024')).toBeDefined()
      },
      { timeout: 500 },
    )

    fireEvent.click(screen.getByText('Best Credit Cards 2024'))
    expect(onPostSelect).toHaveBeenCalledWith('post-1', 'Best Credit Cards 2024')
  })

  it('passes postTypes filter to fetchPosts', async () => {
    render(
      <PostAutocomplete
        value={null}
        label=''
        onChange={vi.fn<VitestLooseMock>()}
        postTypes={['review']}
      />,
    )
    const input = screen.getByPlaceholderText('Search posts...')
    fireEvent.change(input, { target: { value: 'credit' } })

    await waitFor(
      () => {
        expect(mockFetchPosts).toHaveBeenCalledWith(
          expect.objectContaining({ post_types: ['review'] }),
        )
      },
      { timeout: 500 },
    )
  })
})
