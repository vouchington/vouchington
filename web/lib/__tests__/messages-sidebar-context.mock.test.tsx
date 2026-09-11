import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import type { ReactNode } from 'react'

const mockUseAuth = vi.hoisted(() => vi.fn<VitestLooseMock>())
vi.mock(import('@/lib/auth/context'), () => ({
  useAuth: mockUseAuth,
}))

import {
  useOptionalMessagesSidebar,
  type MessagesSidebarPageInfo,
} from '@/lib/messages-sidebar-context'
import {
  MessagesSidebarProvider,
  SignedInMessagesSidebarProvider,
} from '@/lib/messages-sidebar-provider'
import type { DirectConversation } from '@/types/messages'

function makeConversation(overrides?: Partial<DirectConversation>): DirectConversation {
  return {
    id: 'c1',
    channel_type: 'direct_message',
    title: 'Test Conversation',
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    ...overrides,
  }
}

function makePageInfo(
  has_next_page = false,
  end_cursor: string | null = null,
): MessagesSidebarPageInfo {
  return { has_next_page, end_cursor }
}

const wrapper = ({ children }: { children: ReactNode }) => (
  <MessagesSidebarProvider>{children}</MessagesSidebarProvider>
)

describe('MessagesSidebarProvider', () => {
  it('provides initial empty state', () => {
    const { result } = renderHook(() => useOptionalMessagesSidebar(), { wrapper })
    expect(result.current?.conversations).toEqual([])
    expect(result.current?.pageInfo).toBeNull()
    expect(result.current?.isLoaded).toBe(false)
  })

  it('replaceFirstPage sets conversations and marks as loaded', () => {
    const { result } = renderHook(() => useOptionalMessagesSidebar(), { wrapper })
    const conv = makeConversation()
    act(() => {
      result.current?.replaceFirstPage([conv], makePageInfo())
    })
    expect(result.current?.conversations).toEqual([conv])
    expect(result.current?.isLoaded).toBe(true)
    expect(result.current?.pageInfo).toEqual(makePageInfo())
  })

  it('replaceFirstPage preserves optimistic conversations not in server response', () => {
    const { result } = renderHook(() => useOptionalMessagesSidebar(), { wrapper })
    const optimistic = makeConversation({ id: 'opt1', title: 'Optimistic' })
    const server = makeConversation({ id: 'sv1', title: 'Server' })

    act(() => {
      result.current?.prependConversation(optimistic)
    })
    act(() => {
      result.current?.replaceFirstPage([server], makePageInfo())
    })

    const ids = result.current?.conversations.map(c => c.id)
    expect(ids).toContain('opt1')
    expect(ids).toContain('sv1')
  })

  it('replaceFirstPage dedupes when server returns optimistic conversation', () => {
    const { result } = renderHook(() => useOptionalMessagesSidebar(), { wrapper })
    const conv = makeConversation({ id: 'dup1' })

    act(() => {
      result.current?.prependConversation(conv)
    })
    act(() => {
      result.current?.replaceFirstPage([conv], makePageInfo())
    })

    expect(result.current?.conversations.filter(c => c.id === 'dup1').length).toBe(1)
  })

  it('appendPage appends conversations and dedupes', () => {
    const { result } = renderHook(() => useOptionalMessagesSidebar(), { wrapper })
    const c1 = makeConversation({ id: 'c1' })
    const c2 = makeConversation({ id: 'c2', title: 'Second' })
    const c3 = makeConversation({ id: 'c3', title: 'Third' })

    act(() => {
      result.current?.replaceFirstPage([c1, c2], makePageInfo(true, 'cursor'))
    })
    act(() => {
      result.current?.appendPage([c2, c3], makePageInfo())
    })

    expect(result.current?.conversations.map(c => c.id)).toEqual(['c1', 'c2', 'c3'])
    expect(result.current?.pageInfo).toEqual(makePageInfo())
  })

  it('prependConversation adds conversation to the front', () => {
    const { result } = renderHook(() => useOptionalMessagesSidebar(), { wrapper })
    const c1 = makeConversation({ id: 'c1' })
    const c2 = makeConversation({ id: 'c2', title: 'New' })

    act(() => {
      result.current?.replaceFirstPage([c1], makePageInfo())
    })
    act(() => {
      result.current?.prependConversation(c2)
    })

    const convs = result.current?.conversations ?? []
    expect(convs[0]?.id).toBe('c2')
    expect(convs[1]?.id).toBe('c1')
  })
})

describe('SignedInMessagesSidebarProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  function makeWrapper() {
    return ({ children }: { children: ReactNode }) => (
      <SignedInMessagesSidebarProvider>{children}</SignedInMessagesSidebarProvider>
    )
  }

  it('provides context when authenticated', () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: true })
    const { result } = renderHook(() => useOptionalMessagesSidebar(), {
      wrapper: makeWrapper(),
    })
    expect(result.current).not.toBeNull()
    expect(result.current?.conversations).toEqual([])
  })

  it('returns null context when not authenticated', () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: false })
    const { result } = renderHook(() => useOptionalMessagesSidebar(), {
      wrapper: makeWrapper(),
    })
    expect(result.current).toBeNull()
  })
})

describe('useOptionalMessagesSidebar', () => {
  it('returns null outside provider', () => {
    const { result } = renderHook(() => useOptionalMessagesSidebar())
    expect(result.current).toBeNull()
  })
})
