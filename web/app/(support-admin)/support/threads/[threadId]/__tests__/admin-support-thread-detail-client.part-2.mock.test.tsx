import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { usePaginatedList } from '@/hooks/use-paginated-list'
import type { PaginatedData } from '@/hooks/use-paginated-list-utils'
import { getAdminSupportThreadMessagesClient } from '@/lib/api/client/support'
import type { SupportMessage } from '@/types/support'
import { AdminSupportThreadDetailClient } from '../admin-support-thread-detail-client'
import {
  makeMessage,
  makeThread,
  page,
} from '../test-helpers/admin-support-thread-detail-client-test-helpers'

vi.mock(import('@/hooks/use-paginated-list'), () => ({
  usePaginatedList: vi.fn<VitestLooseMock>(),
}))
vi.mock(import('@/lib/api/client/support'), () => ({
  getAdminSupportThreadMessagesClient: vi.fn<VitestLooseMock>(),
  patchAdminSupportThread: vi.fn<VitestLooseMock>(),
  postAdminSupportThreadDraft: vi.fn<VitestLooseMock>(),
  postAdminSupportThreadMessage: vi.fn<VitestLooseMock>(),
}))
vi.mock(import('@/lib/auth/context'), () => ({
  useAuth: () => ({ currentUser: null, isAuthenticated: false }),
}))
vi.mock(import('../admin-support-thread-header'), () => ({
  AdminSupportThreadHeader: () => <div />,
}))
vi.mock(import('../admin-support-reply-composer'), () => ({
  AdminSupportReplyComposer: () => <div data-testid='reply-composer' />,
}))
vi.mock(import('../admin-support-thread-message-list'), () => ({
  AdminSupportThreadMessageList: ({
    messages,
    onMessageUpdate,
    onRefreshMessages,
  }: {
    messages: SupportMessage[]
    onMessageUpdate: (message: SupportMessage) => void
    onRefreshMessages: () => Promise<void>
  }) => (
    <>
      <div data-testid='message-body'>{messages[0]?.body_text}</div>
      <button
        type='button'
        onClick={() => onMessageUpdate({ ...messages[0]!, body_text: 'Local edit' })}
      >
        Update
      </button>
      <button
        type='button'
        onClick={() => void onRefreshMessages()}
      >
        Refresh
      </button>
    </>
  ),
}))

describe('AdminSupportThreadDetailClient refresh', () => {
  it('hides AI draft generation when the thread has no inbound message', () => {
    const outboundPage = page([makeMessage({ direction: 'outbound' })])
    vi.mocked(usePaginatedList).mockReturnValue({
      pages: [outboundPage],
      hasNextPage: false,
      endCursor: null,
      loadMore: vi.fn<() => Promise<void>>(),
      loadingMore: false,
      fetchError: null,
      clearError: vi.fn<() => void>(),
      resetKey: Symbol('messages'),
    })
    render(
      <AdminSupportThreadDetailClient
        thread={makeThread()}
        initialMessagesData={outboundPage}
      />,
    )

    expect(screen.queryByRole('button', { name: 'Generate AI Draft' })).toBeNull()
    expect(screen.getByTestId('reply-composer')).toBeDefined()
  })

  it('keeps AI draft generation available while older messages may contain inbound context', () => {
    const outboundPage = page([makeMessage({ direction: 'outbound' })])
    vi.mocked(usePaginatedList).mockReturnValue({
      pages: [outboundPage],
      hasNextPage: true,
      endCursor: 'older',
      loadMore: vi.fn<() => Promise<void>>(),
      loadingMore: false,
      fetchError: null,
      clearError: vi.fn<() => void>(),
      resetKey: Symbol('messages'),
    })
    render(
      <AdminSupportThreadDetailClient
        thread={makeThread()}
        initialMessagesData={outboundPage}
      />,
    )

    expect(screen.getByRole('button', { name: 'Generate AI Draft' })).toBeDefined()
  })

  it('hides AI draft generation while an unsent outbound draft exists', () => {
    const draftPage = page([
      makeMessage({ direction: 'outbound', drafted_at: '2026-08-10T00:00:00Z' }),
    ])
    vi.mocked(usePaginatedList).mockReturnValue({
      pages: [draftPage],
      hasNextPage: true,
      endCursor: 'older',
      loadMore: vi.fn<() => Promise<void>>(),
      loadingMore: false,
      fetchError: null,
      clearError: vi.fn<() => void>(),
      resetKey: Symbol('draft'),
    })
    render(
      <AdminSupportThreadDetailClient
        thread={makeThread()}
        initialMessagesData={draftPage}
      />,
    )

    expect(screen.queryByRole('button', { name: 'Generate AI Draft' })).toBeNull()
  })

  it('hides reply and draft controls for a resolved thread', () => {
    vi.mocked(usePaginatedList).mockReturnValue({
      pages: [page([makeMessage()])],
      hasNextPage: false,
      endCursor: null,
      loadMore: vi.fn<() => Promise<void>>(),
      loadingMore: false,
      fetchError: null,
      clearError: vi.fn<() => void>(),
      resetKey: Symbol('messages'),
    })
    render(
      <AdminSupportThreadDetailClient
        thread={makeThread({ status: 'resolved' })}
        initialMessagesData={page([makeMessage()])}
      />,
    )

    expect(screen.queryByTestId('reply-composer')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Generate AI Draft' })).toBeNull()
  })

  it('uses refreshed server messages instead of stale local message overlays', async () => {
    const initialMessage = makeMessage({ id: 'message-1', body_text: 'Server before edit' })
    const refreshedPage = page([makeMessage({ id: 'message-1', body_text: 'Server refreshed' })])
    let currentPage = page([initialMessage])
    const replaceFirstPage = vi.fn<(nextPage: PaginatedData) => void>(nextPage => {
      currentPage = nextPage as typeof currentPage
    })
    vi.mocked(usePaginatedList).mockImplementation(() => ({
      pages: [currentPage],
      hasNextPage: false,
      endCursor: null,
      loadMore: vi.fn<() => Promise<void>>(),
      loadingMore: false,
      fetchError: null,
      clearError: vi.fn<() => void>(),
      replaceFirstPage,
      resetKey: Symbol('messages'),
    }))
    vi.mocked(getAdminSupportThreadMessagesClient).mockResolvedValue(refreshedPage)
    render(
      <AdminSupportThreadDetailClient
        thread={makeThread()}
        initialMessagesData={currentPage}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Update' }))
    expect(screen.getByTestId('message-body')).toHaveTextContent('Local edit')
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))

    await waitFor(() => expect(replaceFirstPage).toHaveBeenCalledWith(refreshedPage))
    expect(screen.getByTestId('message-body')).toHaveTextContent('Server refreshed')
  })
})
