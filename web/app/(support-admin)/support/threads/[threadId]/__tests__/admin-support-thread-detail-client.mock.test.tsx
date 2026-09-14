import type { ChangeEvent } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { usePaginatedList } from '@/hooks/use-paginated-list'
import {
  patchAdminSupportThread,
  postAdminSupportThreadDraft,
  postAdminSupportThreadMessage,
} from '@/lib/api/client/support'
import { pollForSupportDraft } from '@/lib/api/client/support-draft-polling'
import type { SupportMessage } from '@/types/support'
import { AdminSupportThreadDetailClient } from '../admin-support-thread-detail-client'
import {
  makeMessage,
  makeThread,
  page,
} from '../../../../../../test-helpers/app/(support-admin)/support/threads/[threadId]/admin-support-thread-detail-client-test-helpers'

vi.mock(import('@/lib/api/client/support'), () => ({
  patchAdminSupportThread: vi.fn<VitestLooseMock>(),
  postAdminSupportThreadMessage: vi.fn<VitestLooseMock>(),
  postAdminSupportThreadDraft: vi.fn<VitestLooseMock>(),
  getAdminSupportThreadMessagesClient: vi.fn<VitestLooseMock>(),
}))
vi.mock(import('@/lib/api/client/support-draft-polling'), () => ({
  pollForSupportDraft: vi.fn<VitestLooseMock>(),
}))
vi.mock(import('@/hooks/use-paginated-list'), () => ({
  usePaginatedList: vi.fn<VitestLooseMock>(),
}))
vi.mock(import('@/lib/auth/context'), () => ({
  useAuth: () => ({
    currentUser: {
      id: '00000000-0000-4000-8000-000000000111',
      roles: ['administrator'],
      isOfficialAccount: false,
    },
    isAuthenticated: true,
  }),
}))
vi.mock(import('../admin-support-thread-header'), () => ({
  AdminSupportThreadHeader: ({
    actionError,
    handleAssignToMe,
    handleReopen,
    handleResolve,
  }: {
    actionError: string | null
    handleAssignToMe: () => void
    handleReopen: () => void
    handleResolve: () => void
  }) => (
    <div>
      {actionError && <p data-testid='action-error'>{actionError}</p>}
      <button
        type='button'
        data-testid='assign-btn'
        onClick={handleAssignToMe}
      >
        Assign
      </button>
      <button
        type='button'
        data-testid='resolve-btn'
        onClick={handleResolve}
      >
        Resolve
      </button>
      <button
        type='button'
        data-testid='reopen-btn'
        onClick={handleReopen}
      >
        Reopen
      </button>
    </div>
  ),
}))
vi.mock(import('../admin-support-reply-composer'), () => ({
  AdminSupportReplyComposer: ({
    handleReplyTextChange,
    handleSendReply,
    replyText,
  }: {
    handleReplyTextChange: (event: ChangeEvent<HTMLTextAreaElement>) => void
    handleSendReply: () => void
    replyText: string
  }) => (
    <div>
      <textarea
        aria-label='Reply text'
        data-testid='reply-textarea'
        value={replyText}
        onChange={handleReplyTextChange}
      />
      <button
        type='button'
        data-testid='send-btn'
        onClick={handleSendReply}
      >
        Save
      </button>
    </div>
  ),
}))
vi.mock(import('../admin-support-message-card'), () => ({
  AdminSupportMessageCard: ({
    message,
    onMessageUpdate,
  }: {
    message: SupportMessage
    onMessageUpdate: (message: SupportMessage) => void
  }) => (
    <div>
      <div data-testid={`message-${message.id}`}>{message.body_text}</div>
      <button
        type='button'
        data-testid={`update-message-${message.id}`}
        onClick={() => onMessageUpdate({ ...message, body_text: `Updated ${message.id}` })}
      >
        Update
      </button>
    </div>
  ),
}))

const mockPatchThread = vi.mocked(patchAdminSupportThread)
const mockPostMessage = vi.mocked(postAdminSupportThreadMessage)
const mockPostDraft = vi.mocked(postAdminSupportThreadDraft)
const mockPollForDraft = vi.mocked(pollForSupportDraft)

describe('AdminSupportThreadDetailClient', () => {
  const thread = makeThread()
  const messages = [makeMessage()]

  beforeEach(() => {
    vi.clearAllMocks()
    mockPatchThread.mockResolvedValue({ thread: makeThread({ status: 'assigned' }) })
    mockPostMessage.mockResolvedValue({
      message: makeMessage({ id: 'msg-new', body_text: 'Reply' }),
    })
    mockPostDraft.mockResolvedValue({ queued: true })
    mockPollForDraft.mockResolvedValue(null)
    vi.mocked(usePaginatedList).mockReturnValue({
      pages: [page(messages)],
      hasNextPage: false,
      endCursor: null,
      loadMore: vi.fn<VitestLooseMock>(),
      loadingMore: false,
      fetchError: null,
      clearError: vi.fn<VitestLooseMock>(),
      replaceFirstPage: vi.fn<VitestLooseMock>(),
      resetToFirstPage: vi.fn<VitestLooseMock>(),
      resetKey: Symbol('messages'),
    })
  })

  it('assigns the authenticated administrator UUID', async () => {
    render(
      <AdminSupportThreadDetailClient
        thread={thread}
        initialMessagesData={page(messages)}
      />,
    )
    fireEvent.click(screen.getByTestId('assign-btn'))
    await waitFor(() =>
      expect(mockPatchThread).toHaveBeenCalledWith('thread-1', {
        assigned_to_id: '00000000-0000-4000-8000-000000000111',
      }),
    )
  })

  it.each([
    ['resolve-btn', true],
    ['reopen-btn', false],
  ])('patches the thread from %s', async (button, resolved) => {
    render(
      <AdminSupportThreadDetailClient
        thread={thread}
        initialMessagesData={page(messages)}
      />,
    )
    fireEvent.click(screen.getByTestId(button))
    await waitFor(() => expect(mockPatchThread).toHaveBeenCalledWith('thread-1', { resolved }))
  })

  it('saves a manual outbound reply and appends it', async () => {
    render(
      <AdminSupportThreadDetailClient
        thread={thread}
        initialMessagesData={page(messages)}
      />,
    )
    fireEvent.change(screen.getByTestId('reply-textarea'), { target: { value: 'My reply' } })
    fireEvent.click(screen.getByTestId('send-btn'))
    await waitFor(() =>
      expect(mockPostMessage).toHaveBeenCalledWith('thread-1', { body_text: 'My reply' }),
    )
    expect(await screen.findByTestId('message-msg-new')).toBeDefined()
  })

  it('loads older messages on demand', () => {
    const loadMore = vi.fn<VitestLooseMock>()
    vi.mocked(usePaginatedList).mockReturnValue({
      pages: [page(messages)],
      hasNextPage: true,
      endCursor: 'older-cursor',
      loadMore,
      loadingMore: false,
      fetchError: null,
      clearError: vi.fn<VitestLooseMock>(),
      resetToFirstPage: vi.fn<VitestLooseMock>(),
      resetKey: Symbol('older'),
    })
    render(
      <AdminSupportThreadDetailClient
        thread={thread}
        initialMessagesData={page(messages)}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Load older messages' }))
    expect(loadMore).toHaveBeenCalledOnce()
  })

  it('keeps a mutation to an older loaded message visible', async () => {
    const newerMessage = makeMessage({ id: 'newer', body_text: 'Newer message' })
    const olderMessage = makeMessage({ id: 'older', body_text: 'Older message' })
    vi.mocked(usePaginatedList).mockReturnValue({
      pages: [page([newerMessage]), page([olderMessage])],
      hasNextPage: false,
      endCursor: null,
      loadMore: vi.fn<VitestLooseMock>(),
      loadingMore: false,
      fetchError: null,
      clearError: vi.fn<VitestLooseMock>(),
      resetToFirstPage: vi.fn<VitestLooseMock>(),
      resetKey: Symbol('updated-older-message'),
    })
    render(
      <AdminSupportThreadDetailClient
        thread={thread}
        initialMessagesData={page([newerMessage])}
      />,
    )

    fireEvent.click(screen.getByTestId('update-message-older'))

    expect(await screen.findByText('Updated older')).toBeDefined()
  })

  it('polls for a queued draft and preserves loaded older pages', async () => {
    const replaceFirstPage = vi.fn<VitestLooseMock>()
    const draftPage = page([
      makeMessage({ id: 'draft', direction: 'outbound', drafted_at: '2024-01-02T00:00:00Z' }),
    ])
    mockPollForDraft.mockResolvedValue(draftPage)
    vi.mocked(usePaginatedList).mockReturnValue({
      pages: [page(messages)],
      hasNextPage: false,
      endCursor: null,
      loadMore: vi.fn<VitestLooseMock>(),
      loadingMore: false,
      fetchError: null,
      clearError: vi.fn<VitestLooseMock>(),
      replaceFirstPage,
      resetKey: Symbol('draft'),
    })
    render(
      <AdminSupportThreadDetailClient
        thread={thread}
        initialMessagesData={page(messages)}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Generate AI Draft' }))
    await waitFor(() => expect(mockPostDraft).toHaveBeenCalledWith('thread-1'))
    await waitFor(() => expect(replaceFirstPage).toHaveBeenCalledWith(draftPage))
  })

  it('shows an action error when a thread mutation fails', async () => {
    mockPatchThread.mockRejectedValueOnce(new Error('Server error'))
    render(
      <AdminSupportThreadDetailClient
        thread={thread}
        initialMessagesData={page(messages)}
      />,
    )
    fireEvent.click(screen.getByTestId('assign-btn'))
    expect(await screen.findByText('Failed to assign')).toBeDefined()
  })
})
