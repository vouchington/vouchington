import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest'
import { render, waitFor, fireEvent, act } from '@testing-library/react'
import type { ReactNode } from 'react'
import { ChatSidebarProvider } from '@/lib/chat-sidebar-context'
let mockPathname = '/chat'
let mockPush: Mock
vi.mock(
  import('next/navigation'),
  () =>
    ({
      usePathname: () => mockPathname,
      useRouter: () => ({ push: mockPush }),
    }) as unknown as typeof import('next/navigation'),
)
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
const mockGetMyConversationsClient = vi.hoisted(() => vi.fn<VitestLooseMock>())
const mockDeleteConversation = vi.hoisted(() => vi.fn<VitestLooseMock>())
const mockUpdateConversationTitle = vi.hoisted(() => vi.fn<VitestLooseMock>())
vi.mock(import('@/lib/api/client/conversations'), () => ({
  getMyConversationsClient: mockGetMyConversationsClient,
  deleteConversation: mockDeleteConversation,
  updateConversationTitle: mockUpdateConversationTitle,
}))
const mockGetFeatureFlagSnapshot = vi.hoisted(() => vi.fn<VitestLooseMock>())
const mockGetFeatureFlagServerSnapshot = vi.hoisted(() => vi.fn<VitestLooseMock>())
vi.mock(import('@/lib/feature-flags/cookies'), () => ({
  getFeatureFlagSnapshot: mockGetFeatureFlagSnapshot,
  getFeatureFlagServerSnapshot: mockGetFeatureFlagServerSnapshot,
}))
vi.mock(
  import('@/lib/on-error'),
  () =>
    ({
      default: vi.fn<(err: unknown, options?: Record<string, unknown>) => void>(),
      onSuccess: vi.fn<(message: string) => void>(),
    }) as unknown as typeof import('@/lib/on-error'),
)
vi.mock(import('@/lib/utils/path'), () => ({
  isActivePath: (pathname: string, href: string) => pathname === href,
}))
// Minimal sidebar UI stubs
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
      SidebarMenuAction: ({
        children,
        showOnHover: _showOnHover,
        'data-pw': dataPw,
        ...props
      }: {
        children: ReactNode
        showOnHover?: boolean
        'data-pw'?: string
        [k: string]: unknown
      }) => (
        <button
          type='button'
          data-testid={dataPw}
          {...props}
        >
          {children}
        </button>
      ),
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
vi.mock(
  import('@/components/ui/alert-dialog'),
  () =>
    ({
      AlertDialog: ({ children }: { children: ReactNode }) => <div>{children}</div>,
      AlertDialogTrigger: ({
        children,
        asChild: _asChild,
      }: {
        children: ReactNode
        asChild?: boolean
      }) => <div>{children}</div>,
      AlertDialogContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
      AlertDialogHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
      AlertDialogFooter: ({ children }: { children: ReactNode }) => <div>{children}</div>,
      AlertDialogTitle: ({ children }: { children: ReactNode }) => <div>{children}</div>,
      AlertDialogDescription: ({ children }: { children: ReactNode }) => <div>{children}</div>,
      AlertDialogCancel: ({ children }: { children: ReactNode }) => (
        <button type='button'>{children}</button>
      ),
      AlertDialogAction: ({
        children,
        onClick,
      }: {
        children: ReactNode
        onClick?: (e: React.MouseEvent) => void
      }) => (
        <button
          type='button'
          onClick={onClick}
        >
          {children}
        </button>
      ),
    }) as unknown as typeof import('@/components/ui/alert-dialog'),
)
const makePageInfo = (has_next_page = false, end_cursor: string | null = null) => ({
  has_next_page,
  end_cursor,
  start_cursor: null,
})
const makeConversation = (id: string, title: string) => ({
  id,
  title,
  created_at: '',
  created_by_id: '',
  updated_at: '',
  updated_by_id: null,
  deleted_at: null,
  deleted_by_id: null,
})
import { ChatsSidebarGroup } from '../chats-sidebar-group'
describe('ChatsSidebarGroup', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPathname = '/chat'
    mockPush = vi.fn<(href: string) => void>()
    mockGetFeatureFlagSnapshot.mockReturnValue({ chat: true })
    mockGetFeatureFlagServerSnapshot.mockReturnValue({})
    mockGetMyConversationsClient.mockResolvedValue({
      results: [],
      page_info: makePageInfo(),
    })
  })
  afterEach(() => {
    vi.useRealTimers()
  })
  function renderWithProvider() {
    return render(
      <ChatSidebarProvider>
        <ChatsSidebarGroup />
      </ChatSidebarProvider>,
    )
  }

  it('does not show Support link when support feature flag is disabled', async () => {
    mockGetFeatureFlagSnapshot.mockReturnValue({ chat: true })
    const { queryByRole } = renderWithProvider()
    await waitFor(() => expect(mockGetMyConversationsClient).toHaveBeenCalled())
    expect(queryByRole('link', { name: /^Support$/i })).toBeNull()
  })

  it('shows Support link when support feature flag is enabled', async () => {
    mockGetFeatureFlagSnapshot.mockReturnValue({ chat: true, support: true })
    const { getByRole } = renderWithProvider()
    await waitFor(() => {
      expect(getByRole('link', { name: /^Support$/i })).toBeDefined()
    })
  })

  it('shows rename button for each conversation', async () => {
    mockGetMyConversationsClient.mockResolvedValue({
      results: [makeConversation('conv-1', 'Test chat')],
      page_info: makePageInfo(),
    })
    const { getByTestId } = renderWithProvider()
    await waitFor(() => {
      expect(getByTestId('chat-rename-button')).toBeDefined()
    })
  })

  it('shows rename input when rename button is clicked', async () => {
    mockGetMyConversationsClient.mockResolvedValue({
      results: [makeConversation('conv-1', 'Test chat')],
      page_info: makePageInfo(),
    })
    const { getByTestId, getByRole } = renderWithProvider()
    await waitFor(() => {
      expect(getByTestId('chat-rename-button')).toBeDefined()
    })
    fireEvent.click(getByTestId('chat-rename-button'))
    await waitFor(() => {
      const input = getByRole('textbox') as HTMLInputElement
      expect(input).toBeDefined()
      expect(input.value).toBe('Test chat')
    })
  })

  it('calls updateConversationTitle once when Enter also blurs rename input', async () => {
    mockUpdateConversationTitle.mockResolvedValue({
      conversation: makeConversation('conv-1', 'Updated title'),
    })
    mockGetMyConversationsClient.mockResolvedValue({
      results: [makeConversation('conv-1', 'Test chat')],
      page_info: makePageInfo(),
    })
    const { getByTestId, getByRole } = renderWithProvider()
    await waitFor(() => expect(getByTestId('chat-rename-button')).toBeDefined())
    fireEvent.click(getByTestId('chat-rename-button'))
    await waitFor(() => expect(getByRole('textbox')).toBeDefined())
    const input = getByRole('textbox') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'Updated title' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    fireEvent.blur(input)
    await waitFor(() => {
      expect(mockUpdateConversationTitle).toHaveBeenCalledOnce()
      expect(mockUpdateConversationTitle).toHaveBeenCalledWith('conv-1', 'Updated title')
    })
  })

  it('cancels rename on Escape key', async () => {
    mockGetMyConversationsClient.mockResolvedValue({
      results: [makeConversation('conv-1', 'Test chat')],
      page_info: makePageInfo(),
    })
    const { getByTestId, getByRole, queryByRole } = renderWithProvider()
    await waitFor(() => expect(getByTestId('chat-rename-button')).toBeDefined())
    fireEvent.click(getByTestId('chat-rename-button'))
    await waitFor(() => expect(getByRole('textbox')).toBeDefined())
    const input = getByRole('textbox') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'Changed but cancelled' } })
    act(() => {
      fireEvent.keyDown(input, { key: 'Escape' })
    })
    await waitFor(() => {
      expect(queryByRole('textbox')).toBeNull()
      expect(mockUpdateConversationTitle).not.toHaveBeenCalled()
    })
  })
})
