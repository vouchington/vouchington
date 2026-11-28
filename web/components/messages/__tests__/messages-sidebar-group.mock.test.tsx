import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, waitFor, fireEvent, act } from '@testing-library/react'
import type { ReactNode } from 'react'
import { setupInfiniteScrollObserverHarness } from '@/test-helpers/infinite-scroll-observer-harness'

const mockUseAuth = vi.hoisted(() => vi.fn<VitestLooseMock>())
vi.mock(import('@/lib/auth/context'), () => ({ useAuth: mockUseAuth }))

import { SignedInMessagesSidebarProvider } from '@/lib/messages-sidebar-provider'

let mockPathname = '/messages'

vi.mock(import('next/navigation'), () => ({
  usePathname: () => mockPathname,
}))

vi.mock(
  import('next/link'),
  () =>
    ({
      default: ({
        children,
        href,
        prefetch: _prefetch,
        ...props
      }: {
        children: ReactNode
        href: string
        prefetch?: boolean
        [k: string]: unknown
      }) => (
        <a
          href={href}
          {...props}
        >
          {children}
        </a>
      ),
    }) as unknown as typeof import('next/link'),
)

const mockGetMyMessages = vi.hoisted(() => vi.fn<VitestLooseMock>())
vi.mock(import('@/lib/api/client/messages'), () => ({
  getMyMessagesClient: mockGetMyMessages,
}))

const mockOnError = vi.hoisted(() =>
  vi.fn<(err: unknown, options?: Record<string, unknown>) => void>(),
)
vi.mock(
  import('@/lib/on-error'),
  () => ({ default: mockOnError }) as unknown as typeof import('@/lib/on-error'),
)

vi.mock(import('@/lib/utils/path'), () => ({
  isActivePath: (pathname: string, href: string) => pathname === href,
}))

const makePageInfo = (has_next_page = false, end_cursor: string | null = null) => ({
  has_next_page,
  end_cursor,
})

const makeConversation = (id: string, title = 'Conversation') => ({
  id,
  channel_type: 'direct_message' as const,
  title,
  created_at: '',
  updated_at: '',
})

import '@/test-helpers/components/messages/messages-sidebar-group.mock-support'
import { MessagesSidebarGroup } from '../messages-sidebar-group'

describe('MessagesSidebarGroup', () => {
  const { rafCallbacks, flushRaf, triggerIntersection, triggerScroll } =
    setupInfiniteScrollObserverHarness()

  beforeEach(() => {
    vi.clearAllMocks()
    mockUseAuth.mockReturnValue({ isAuthenticated: true })
    mockPathname = '/messages'
    mockGetMyMessages.mockResolvedValue({ results: [], page_info: makePageInfo() })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  function renderWithProvider() {
    return render(
      <SignedInMessagesSidebarProvider>
        <MessagesSidebarGroup />
      </SignedInMessagesSidebarProvider>,
    )
  }

  it('does not render without sidebar context', () => {
    const { container } = render(<MessagesSidebarGroup />)
    expect(container.firstChild).toBeNull()
    expect(mockGetMyMessages).not.toHaveBeenCalled()
  })

  it('renders "All Messages" link when context is provided', async () => {
    const { getByText } = renderWithProvider()
    await waitFor(() => {
      expect(getByText('All Messages')).toBeInTheDocument()
    })
  })

  it('fetches conversations on mount', async () => {
    renderWithProvider()
    await waitFor(() => {
      expect(mockGetMyMessages).toHaveBeenCalledWith()
    })
  })

  it('retries the initial fetch after a failure', async () => {
    vi.useFakeTimers()
    mockGetMyMessages.mockRejectedValueOnce(new Error('network error')).mockResolvedValueOnce({
      results: [makeConversation('c1', 'Recovered chat')],
      page_info: makePageInfo(),
    })

    const { getByText } = renderWithProvider()
    expect(mockGetMyMessages).toHaveBeenCalledTimes(1)

    await act(async () => {
      await Promise.resolve()
      await vi.advanceTimersByTimeAsync(5000)
      await Promise.resolve()
    })

    expect(mockGetMyMessages).toHaveBeenCalledTimes(2)
    expect(getByText('Recovered chat')).toBeInTheDocument()
  })

  it('loads more conversations when load-more button is clicked', async () => {
    const cursor = 'cursor-1'
    mockGetMyMessages
      .mockResolvedValueOnce({
        results: [makeConversation('c1', 'First chat')],
        page_info: makePageInfo(true, cursor),
      })
      .mockResolvedValueOnce({
        results: [makeConversation('c2', 'Second chat')],
        page_info: makePageInfo(),
      })

    const { getByText } = renderWithProvider()
    await waitFor(() => {
      expect(getByText('Load more')).toBeInTheDocument()
    })

    await act(async () => {
      fireEvent.click(getByText('Load more'))
      await Promise.resolve()
    })

    await waitFor(() => {
      expect(getByText('Second chat')).toBeInTheDocument()
    })
    expect(mockGetMyMessages).toHaveBeenCalledTimes(2)
    expect(mockGetMyMessages).toHaveBeenLastCalledWith(cursor)
  })

  it('calls onError when load-more fails', async () => {
    const cursor = 'cursor-1'
    mockGetMyMessages
      .mockResolvedValueOnce({
        results: [],
        page_info: makePageInfo(true, cursor),
      })
      .mockRejectedValueOnce(new Error('network error'))

    const { getByText } = renderWithProvider()
    await waitFor(() => {
      expect(getByText('Load more')).toBeInTheDocument()
    })

    await act(async () => {
      fireEvent.click(getByText('Load more'))
      await Promise.resolve()
    })

    expect(mockOnError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ fallback: 'Failed to load more messages' }),
    )
    expect(getByText('Retry')).toBeInTheDocument()
  })

  it('uses the same continuation action for automatic and manual loading', async () => {
    const pages = new Map([
      [
        undefined,
        {
          results: [makeConversation('c1', 'First chat')],
          page_info: makePageInfo(true, 'cursor-1'),
        },
      ],
      [
        'cursor-1',
        {
          results: [makeConversation('c2', 'Second chat')],
          page_info: makePageInfo(true, 'cursor-2'),
        },
      ],
      [
        'cursor-2',
        {
          results: [makeConversation('c3', 'Third chat')],
          page_info: makePageInfo(),
        },
      ],
    ])
    mockGetMyMessages.mockImplementation(async (cursor?: string) => {
      const page = pages.get(cursor)
      if (!page) throw new Error(`Unexpected messages cursor: ${cursor}`)
      return page
    })

    const { getByRole, getByText } = renderWithProvider()
    // The footer can render before the effect registers the sentinel's observer.
    await waitFor(() => expect(rafCallbacks.size).toBeGreaterThan(0))
    await act(async () => {
      flushRaf()
      triggerScroll()
      triggerIntersection(true)
    })
    expect(mockGetMyMessages).toHaveBeenNthCalledWith(2, 'cursor-1')
    expect(getByText('Second chat')).toBeInTheDocument()

    await act(async () => {
      fireEvent.click(getByRole('button', { name: 'Load more' }))
    })
    expect(mockGetMyMessages).toHaveBeenNthCalledWith(3, 'cursor-2')
    expect(getByText('Third chat')).toBeInTheDocument()
  })
})
