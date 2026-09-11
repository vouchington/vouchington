import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockSendDirectMessage, mockGetDirectMessageThreadClient, mockOnError } = vi.hoisted(() => ({
  mockSendDirectMessage: vi.fn<VitestLooseMock>(),
  mockGetDirectMessageThreadClient: vi.fn<VitestLooseMock>(),
  mockOnError: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/api/client/messages'), () => ({
  sendDirectMessage: mockSendDirectMessage,
  getDirectMessageThreadClient: mockGetDirectMessageThreadClient,
}))

vi.mock(import('@/lib/navigation/use-resolved-breadcrumbs'), () => ({
  useResolvedBreadcrumbs: vi.fn<VitestLooseMock>().mockReturnValue([]),
}))

vi.mock(import('@/lib/on-error'), () => ({
  default: mockOnError,
}))

vi.mock(import('@/components/page-with-aside'), () => ({
  PageWithAside: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

vi.mock(import('@/components/ui/breadcrumb'), () => ({
  Breadcrumbs: () => <nav />,
}))

vi.mock(
  import('@/components/ui/button'),
  () =>
    ({
      Button: ({
        children,
        onClick,
        disabled,
        type: _type,
        loading: _loading,
        ...rest
      }: {
        children: React.ReactNode
        onClick?: () => void
        disabled?: boolean
        type?: string
        loading?: boolean
        [k: string]: unknown
      }) => (
        <button
          type='button'
          onClick={onClick}
          disabled={disabled}
          {...rest}
        >
          {children}
        </button>
      ),
    }) as unknown as typeof import('@/components/ui/button'),
)

vi.mock(
  import('@/components/ui/textarea'),
  () =>
    ({
      Textarea: ({
        value,
        onChange,
        disabled,
        ...rest
      }: {
        value?: string
        onChange?: React.ChangeEventHandler<HTMLTextAreaElement>
        disabled?: boolean
        [k: string]: unknown
      }) => (
        <textarea
          value={value}
          onChange={onChange}
          disabled={disabled}
          {...rest}
        />
      ),
    }) as unknown as typeof import('@/components/ui/textarea'),
)

vi.mock(import('@/components/shared/time-ago'), () => ({
  TimeAgo: () => <time>now</time>,
}))

import { DirectMessagePageClient } from '../conversation-page-client'
import type { DirectMessage } from '@/types/messages'

function makeMessage(id: string, text: string): DirectMessage {
  return {
    id,
    conversation_id: 'conv-1',
    body_text: text,
    created_by_id: 'user-1',
    created_at: '2026-01-01T00:00:00Z',
  }
}

describe('DirectMessagePageClient', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('renders empty state and thread container', () => {
    const { container } = render(
      <DirectMessagePageClient
        conversationId='conv-1'
        currentUserId='user-1'
        initialMessages={[]}
        initialHasMore={false}
        initialEndCursor={null}
        initialParticipants={[]}
        isOwner={false}
        initialParticipantAddPolicy='owner_only'
      />,
    )
    expect(screen.getByText('No messages yet. Send the first one!')).toBeDefined()
    expect(container.querySelector('[data-pw="dm-thread-messages"]')).not.toBeNull()
  })

  it('renders messages with sender labels', () => {
    render(
      <DirectMessagePageClient
        conversationId='conv-1'
        currentUserId='user-1'
        initialMessages={[makeMessage('msg-1', 'Hello world')]}
        initialHasMore={false}
        initialEndCursor={null}
        initialParticipants={[]}
        isOwner={false}
        initialParticipantAddPolicy='owner_only'
      />,
    )
    expect(screen.getByText('Hello world')).toBeDefined()
    expect(screen.getByText('You')).toBeDefined()
  })

  it('renders compose input and send button', () => {
    render(
      <DirectMessagePageClient
        conversationId='conv-1'
        currentUserId='user-1'
        initialMessages={[]}
        initialHasMore={false}
        initialEndCursor={null}
        initialParticipants={[]}
        isOwner={false}
        initialParticipantAddPolicy='owner_only'
      />,
    )
    expect(screen.getByRole('textbox', { name: 'Direct message' })).toHaveAttribute(
      'data-pw',
      'dm-compose-input',
    )
    expect(screen.getByRole('button', { name: 'Send' })).toHaveAttribute(
      'data-pw',
      'dm-send-button',
    )
  })

  it('sends a message on form submit', async () => {
    mockSendDirectMessage.mockResolvedValueOnce({
      message: {
        id: 'new-msg',
        conversation_id: 'conv-1',
        body_text: 'Reply',
        created_at: '2026-01-01T00:00:00Z',
      },
    })

    render(
      <DirectMessagePageClient
        conversationId='conv-1'
        currentUserId='user-1'
        initialMessages={[]}
        initialHasMore={false}
        initialEndCursor={null}
        initialParticipants={[]}
        isOwner={false}
        initialParticipantAddPolicy='owner_only'
      />,
    )

    const textarea = screen.getByRole('textbox', { name: 'Direct message' })
    fireEvent.change(textarea, { target: { value: 'Hello!' } })

    const form = textarea.closest('form')!
    fireEvent.submit(form)

    await waitFor(() => {
      expect(mockSendDirectMessage).toHaveBeenCalledWith('conv-1', 'Hello!')
    })
  })

  it('shows load more button when initialHasMore is true', () => {
    const { container } = render(
      <DirectMessagePageClient
        conversationId='conv-1'
        currentUserId='user-1'
        initialMessages={[makeMessage('msg-1', 'Hi')]}
        initialHasMore
        initialEndCursor='cursor-1'
        initialParticipants={[]}
        isOwner={false}
        initialParticipantAddPolicy='owner_only'
      />,
    )
    expect(container.querySelector('[data-pw="dm-load-more-button"]')).not.toBeNull()
  })

  it('calls getDirectMessageThreadClient on load more click', async () => {
    mockGetDirectMessageThreadClient.mockResolvedValueOnce({
      results: [makeMessage('older', 'Older message')],
      page_info: { has_next_page: false, end_cursor: null },
    })

    const { container } = render(
      <DirectMessagePageClient
        conversationId='conv-1'
        currentUserId='user-1'
        initialMessages={[makeMessage('msg-1', 'Hi')]}
        initialHasMore
        initialEndCursor='cursor-1'
        initialParticipants={[]}
        isOwner={false}
        initialParticipantAddPolicy='owner_only'
      />,
    )

    const btn = container.querySelector('[data-pw="dm-load-more-button"]') as HTMLButtonElement
    fireEvent.click(btn)

    await waitFor(() => {
      expect(mockGetDirectMessageThreadClient).toHaveBeenCalledWith('conv-1', {
        after: 'cursor-1',
      })
    })
  })

  it('calls onError when getDirectMessageThreadClient fails', async () => {
    const err = new Error('load error')
    mockGetDirectMessageThreadClient.mockRejectedValueOnce(err)

    const { container } = render(
      <DirectMessagePageClient
        conversationId='conv-1'
        currentUserId='user-1'
        initialMessages={[makeMessage('msg-1', 'Hi')]}
        initialHasMore
        initialEndCursor='cursor-1'
        initialParticipants={[]}
        isOwner={false}
        initialParticipantAddPolicy='owner_only'
      />,
    )

    const btn = container.querySelector('[data-pw="dm-load-more-button"]') as HTMLButtonElement
    fireEvent.click(btn)

    await waitFor(() => {
      expect(mockOnError).toHaveBeenCalledWith(err, {
        fallback: 'Failed to load older messages',
      })
    })
  })

  it('calls onError when sendDirectMessage fails and removes optimistic message', async () => {
    const err = new Error('send error')
    mockSendDirectMessage.mockRejectedValueOnce(err)

    render(
      <DirectMessagePageClient
        conversationId='conv-1'
        currentUserId='user-1'
        initialMessages={[]}
        initialHasMore={false}
        initialEndCursor={null}
        initialParticipants={[]}
        isOwner={false}
        initialParticipantAddPolicy='owner_only'
      />,
    )

    const textarea = screen.getByRole('textbox', { name: 'Direct message' })
    fireEvent.change(textarea, { target: { value: 'Test message' } })
    fireEvent.submit(textarea.closest('form')!)

    await waitFor(() => {
      expect(mockOnError).toHaveBeenCalledWith(err, { fallback: 'Failed to send message' })
    })
  })
})
