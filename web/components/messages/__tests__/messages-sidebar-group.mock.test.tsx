import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, waitFor, fireEvent, act } from '@testing-library/react'
import type { ReactNode } from 'react'
import { MessagesSidebarProvider } from '@/lib/messages-sidebar-provider'

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

vi.mock<typeof import('@/test-helpers/infinite-scroll')>(
  import('@/test-helpers/infinite-scroll'),
  async importOriginal => importOriginal(),
)
vi.mock(
  import('@/components/shared/infinite-scroll'),
  async () => import('@/test-helpers/infinite-scroll'),
)

vi.mock(
  import('@/components/ui/sidebar'),
  () =>
    ({
      SidebarGroup: ({ children }: { children: ReactNode }) => <div>{children}</div>,
      SidebarGroupLabel: ({
        children,
        asChild: _asChild,
        ...props
      }: {
        children: ReactNode
        asChild?: boolean
        [k: string]: unknown
      }) => <div {...props}>{children}</div>,
      SidebarGroupContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
      SidebarMenu: ({ children }: { children: ReactNode }) => <ul>{children}</ul>,
      SidebarMenuItem: ({ children, ...props }: { children: ReactNode; [k: string]: unknown }) => (
        <li {...props}>{children}</li>
      ),
      SidebarMenuButton: ({
        children,
        asChild: _asChild,
        isActive: _isActive,
        ...props
      }: {
        children: ReactNode
        asChild?: boolean
        isActive?: boolean
        [k: string]: unknown
      }) => <div {...props}>{children}</div>,
    }) as unknown as typeof import('@/components/ui/sidebar'),
)

vi.mock(
  import('@/components/ui/collapsible'),
  () =>
    ({
      Collapsible: ({ children, ...props }: { children: ReactNode; [k: string]: unknown }) => (
        <div {...props}>{children}</div>
      ),
      CollapsibleTrigger: ({
        children,
        ...props
      }: {
        children: ReactNode
        [k: string]: unknown
      }) => (
        <button
          type='button'
          {...props}
        >
          {children}
        </button>
      ),
      CollapsibleContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    }) as unknown as typeof import('@/components/ui/collapsible'),
)

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

import { MessagesSidebarGroup } from '../messages-sidebar-group'

describe('MessagesSidebarGroup', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPathname = '/messages'
    mockGetMyMessages.mockResolvedValue({ results: [], page_info: makePageInfo() })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  function renderWithProvider() {
    return render(
      <MessagesSidebarProvider>
        <MessagesSidebarGroup />
      </MessagesSidebarProvider>,
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
      expect(getByText('All Messages')).toBeDefined()
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
    expect(getByText('Recovered chat')).toBeDefined()
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
      expect(getByText('Load more')).toBeDefined()
    })

    await act(async () => {
      fireEvent.click(getByText('Load more'))
      await Promise.resolve()
    })

    await waitFor(() => {
      expect(getByText('Second chat')).toBeDefined()
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
      expect(getByText('Load more')).toBeDefined()
    })

    await act(async () => {
      fireEvent.click(getByText('Load more'))
      await Promise.resolve()
    })

    expect(mockOnError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ fallback: 'Failed to load more messages' }),
    )
    expect(getByText('Retry')).toBeDefined()
  })

  it('uses the same continuation action for automatic and manual loading', async () => {
    mockGetMyMessages
      .mockResolvedValueOnce({
        results: [makeConversation('c1')],
        page_info: makePageInfo(true, 'cursor-1'),
      })
      .mockResolvedValueOnce({
        results: [makeConversation('c2')],
        page_info: makePageInfo(true, 'cursor-2'),
      })
      .mockResolvedValueOnce({
        results: [makeConversation('c3')],
        page_info: makePageInfo(),
      })

    const { getByText } = renderWithProvider()
    await waitFor(() => expect(getByText('Auto load')).toBeDefined())
    fireEvent.click(getByText('Auto load'))
    await waitFor(() => expect(mockGetMyMessages).toHaveBeenCalledWith('cursor-1'))
    fireEvent.click(getByText('Load more'))
    await waitFor(() => expect(mockGetMyMessages).toHaveBeenCalledWith('cursor-2'))
  })
})
