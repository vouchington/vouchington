import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockGetMyMessagesClient, mockOnError } = vi.hoisted(() => ({
  mockGetMyMessagesClient: vi.fn<VitestLooseMock>(),
  mockOnError: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/api/client/messages'), () => ({
  getMyMessagesClient: mockGetMyMessagesClient,
}))

vi.mock(import('@/lib/on-error'), () => ({
  default: mockOnError,
}))

vi.mock(
  import('next/link'),
  () =>
    ({
      default: ({
        children,
        href,
        ...props
      }: {
        children: React.ReactNode
        href: string
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

vi.mock(
  import('@/components/ui/button'),
  () =>
    ({
      Button: ({
        children,
        onClick,
        disabled,
        loading: _loading,
        ...rest
      }: {
        children: React.ReactNode
        onClick?: () => void
        disabled?: boolean
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

vi.mock(import('@/components/shared/time-ago'), () => ({
  TimeAgo: () => <time>now</time>,
}))

vi.mock<typeof import('@/test-helpers/infinite-scroll')>(
  import('@/test-helpers/infinite-scroll'),
  async importOriginal => importOriginal(),
)
vi.mock(
  import('@/components/shared/infinite-scroll'),
  async () => import('@/test-helpers/infinite-scroll'),
)

import { MessagesInboxClient } from '../messages-inbox-client'
import type { DirectConversation } from '@/types/messages'

function makeConversation(overrides: Partial<DirectConversation> = {}): DirectConversation {
  return {
    id: 'conv-1',
    participant_usernames: ['alice'],
    title: '',
    updated_at: '2026-01-01T00:00:00Z',
    channel_type: 'direct_message',
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

describe('MessagesInboxClient', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('renders empty state when no conversations', () => {
    render(
      <MessagesInboxClient
        initialConversations={[]}
        initialHasMore={false}
        initialEndCursor={null}
      />,
    )
    expect(screen.getByText('No messages yet.')).toBeDefined()
  })

  it('renders conversation items', () => {
    const { container } = render(
      <MessagesInboxClient
        initialConversations={[makeConversation()]}
        initialHasMore={false}
        initialEndCursor={null}
      />,
    )
    expect(container.querySelector('[data-pw="messages-inbox-item"]')).not.toBeNull()
  })

  it('shows participant username in conversation item', () => {
    render(
      <MessagesInboxClient
        initialConversations={[makeConversation({ participant_usernames: ['alice'] })]}
        initialHasMore={false}
        initialEndCursor={null}
      />,
    )
    expect(screen.getByText('alice')).toBeDefined()
  })

  it('shows load more button when hasMore is true', () => {
    render(
      <MessagesInboxClient
        initialConversations={[makeConversation()]}
        initialHasMore
        initialEndCursor='cursor-1'
      />,
    )
    expect(screen.getByText('Load more')).toBeDefined()
  })

  it('does not show load more button when hasMore is false', () => {
    render(
      <MessagesInboxClient
        initialConversations={[makeConversation()]}
        initialHasMore={false}
        initialEndCursor={null}
      />,
    )
    expect(screen.queryByText('Load more')).toBeNull()
  })

  it('renders conversation link with correct href', () => {
    const { container } = render(
      <MessagesInboxClient
        initialConversations={[makeConversation({ id: 'conv-abc' })]}
        initialHasMore={false}
        initialEndCursor={null}
      />,
    )
    const link = container.querySelector('[data-pw="messages-inbox-item"]') as HTMLAnchorElement
    expect(link?.getAttribute('href')).toBe('/messages/conv-abc')
  })

  it('calls getMyMessagesClient on load more click and appends conversations', async () => {
    const newConv = makeConversation({ id: 'conv-2', participant_usernames: ['bob'] })
    mockGetMyMessagesClient.mockResolvedValueOnce({
      results: [newConv],
      page_info: { has_next_page: false, end_cursor: null },
    })

    const { container } = render(
      <MessagesInboxClient
        initialConversations={[makeConversation()]}
        initialHasMore
        initialEndCursor='cursor-1'
      />,
    )

    fireEvent.click(screen.getByText('Load more'))

    await waitFor(() => {
      expect(mockGetMyMessagesClient).toHaveBeenCalledWith('cursor-1')
    })
  })

  it('restarts continuation from refreshed page-one metadata after focus', async () => {
    mockGetMyMessagesClient
      .mockResolvedValueOnce({
        results: [
          makeConversation({
            id: 'conv-new',
            participant_usernames: ['new activity'],
            updated_at: '2026-01-02T00:00:00Z',
          }),
        ],
        page_info: { has_next_page: true, end_cursor: 'refreshed-cursor' },
      })
      .mockResolvedValueOnce({
        results: [makeConversation({ id: 'conv-displaced', participant_usernames: ['displaced'] })],
        page_info: { has_next_page: false, end_cursor: null },
      })

    render(
      <MessagesInboxClient
        initialConversations={[makeConversation()]}
        initialHasMore={false}
        initialEndCursor={null}
      />,
    )

    fireEvent.focus(window)

    const button = await screen.findByText('Load more')
    fireEvent.click(button)

    await waitFor(() => {
      expect(mockGetMyMessagesClient).toHaveBeenNthCalledWith(1)
      expect(mockGetMyMessagesClient).toHaveBeenNthCalledWith(2, 'refreshed-cursor')
      expect(screen.getByText('displaced')).toBeDefined()
    })
  })

  it('calls onError when getMyMessagesClient fails', async () => {
    const err = new Error('load error')
    mockGetMyMessagesClient.mockRejectedValueOnce(err)

    render(
      <MessagesInboxClient
        initialConversations={[makeConversation()]}
        initialHasMore
        initialEndCursor='cursor-1'
      />,
    )

    fireEvent.click(screen.getByText('Load more'))

    await waitFor(() => {
      expect(mockOnError).toHaveBeenCalledWith(err, {
        fallback: 'Failed to load more conversations',
      })
    })
    expect(screen.getByText('Retry')).toBeDefined()
  })

  it('uses the same continuation action for automatic and manual loading', async () => {
    mockGetMyMessagesClient
      .mockResolvedValueOnce({
        results: [makeConversation({ id: 'conv-2' })],
        page_info: { has_next_page: true, end_cursor: 'cursor-2' },
      })
      .mockResolvedValueOnce({
        results: [makeConversation({ id: 'conv-3' })],
        page_info: { has_next_page: false, end_cursor: null },
      })

    const { container } = render(
      <MessagesInboxClient
        initialConversations={[makeConversation()]}
        initialHasMore
        initialEndCursor='cursor-1'
      />,
    )

    fireEvent.click(container.querySelector('[data-pw="test-auto-continuation"]')!)
    await waitFor(() => expect(mockGetMyMessagesClient).toHaveBeenCalledWith('cursor-1'))
    fireEvent.click(container.querySelector('[data-pw="test-manual-continuation"]')!)
    await waitFor(() => expect(mockGetMyMessagesClient).toHaveBeenCalledWith('cursor-2'))
  })

  it('falls back to title when participant_usernames is empty', () => {
    render(
      <MessagesInboxClient
        initialConversations={[
          makeConversation({ participant_usernames: [], title: 'Group Chat' }),
        ]}
        initialHasMore={false}
        initialEndCursor={null}
      />,
    )
    expect(screen.getByText('Group Chat')).toBeDefined()
  })
})
