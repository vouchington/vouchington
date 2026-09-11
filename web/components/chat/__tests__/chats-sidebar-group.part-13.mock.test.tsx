import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest'

import { render, waitFor, fireEvent } from '@testing-library/react'

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

import onError from '@/lib/on-error'
import { ChatsSidebarGroup } from '../chats-sidebar-group'

describe('ChatsSidebarGroup — rename edge cases', () => {
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

  it('saves rename when input loses focus (blur)', async () => {
    mockUpdateConversationTitle.mockResolvedValue({
      conversation: makeConversation('conv-1', 'New title'),
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
    fireEvent.change(input, { target: { value: 'New title' } })
    fireEvent.blur(input)
    await waitFor(() => {
      expect(mockUpdateConversationTitle).toHaveBeenCalledWith('conv-1', 'New title')
    })
  })

  it('reverts title and reports error when rename API fails', async () => {
    const apiError = new Error('Network error')
    mockUpdateConversationTitle.mockRejectedValue(apiError)
    mockGetMyConversationsClient.mockResolvedValue({
      results: [makeConversation('conv-1', 'Test chat')],
      page_info: makePageInfo(),
    })
    const { getByTestId, getByRole } = renderWithProvider()
    await waitFor(() => expect(getByTestId('chat-rename-button')).toBeDefined())
    fireEvent.click(getByTestId('chat-rename-button'))
    await waitFor(() => expect(getByRole('textbox')).toBeDefined())
    const input = getByRole('textbox') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'New title' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => {
      expect(mockUpdateConversationTitle).toHaveBeenCalledWith('conv-1', 'New title')
      expect(vi.mocked(onError)).toHaveBeenCalledWith(
        apiError,
        expect.objectContaining({ fallback: 'Failed to rename chat' }),
      )
    })
  })
})
