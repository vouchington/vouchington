import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockGetModmailMessagesClient, mockSendModmailMessage, mockResolveModmailThread } =
  vi.hoisted(() => ({
    mockGetModmailMessagesClient: vi.fn<VitestLooseMock>(),
    mockSendModmailMessage: vi.fn<VitestLooseMock>(),
    mockResolveModmailThread: vi.fn<VitestLooseMock>(),
  }))

vi.mock(import('@/lib/api/client/modmail'), () => ({
  getModmailMessagesClient: mockGetModmailMessagesClient,
  sendModmailMessage: mockSendModmailMessage,
  resolveModmailThread: mockResolveModmailThread,
}))

vi.mock(import('@/lib/on-error'), () => ({
  default: vi.fn<VitestLooseMock>(),
}))

vi.mock(
  import('@/components/ui/badge'),
  () =>
    ({
      Badge: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
    }) as unknown as typeof import('@/components/ui/badge'),
)

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
        type?: 'button' | 'reset' | 'submit'
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

import { ModmailThreadClient } from '../modmail-thread-client'
import type { ModmailThread, ModmailMessage } from '@/lib/api/client/modmail'

function makeThread(overrides: Partial<ModmailThread> = {}): ModmailThread {
  return {
    id: 'thread-1',
    channel_type: 'modmail',
    title: 'Thread subject',
    community_id: 'c1',
    subject_user_id: 'user-subject',
    assigned_mod_id: null,
    assigned_at: null,
    resolved_at: null,
    resolved_by_id: null,
    created_by_id: 'user-subject',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

function makeMessage(id: string): ModmailMessage {
  return {
    id,
    conversation_id: 'thread-1',
    body_text: `Message ${id}`,
    created_by_id: 'user-1',
    created_at: '2026-01-01T00:00:00Z',
  }
}

describe('ModmailThreadClient', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('renders thread view with no messages', () => {
    render(
      <ModmailThreadClient
        communitySlug='test-community'
        thread={makeThread()}
        initialMessages={[]}
        initialHasMore={false}
        initialEndCursor={null}
        isMod
      />,
    )
    expect(screen.getByText('No messages yet.')).toBeDefined()
  })

  it('renders modmail-thread-view data-pw attribute', () => {
    const { container } = render(
      <ModmailThreadClient
        communitySlug='test-community'
        thread={makeThread()}
        initialMessages={[]}
        initialHasMore={false}
        initialEndCursor={null}
        isMod
      />,
    )
    expect(container.querySelector('[data-pw="modmail-thread-view"]')).not.toBeNull()
  })

  it('renders existing messages', () => {
    render(
      <ModmailThreadClient
        communitySlug='test-community'
        thread={makeThread()}
        initialMessages={[makeMessage('msg-1')]}
        initialHasMore={false}
        initialEndCursor={null}
        isMod={false}
      />,
    )
    expect(screen.getByText('Message msg-1')).toBeDefined()
  })

  it('shows resolve button for mods on open threads', () => {
    const { container } = render(
      <ModmailThreadClient
        communitySlug='test-community'
        thread={makeThread()}
        initialMessages={[]}
        initialHasMore={false}
        initialEndCursor={null}
        isMod
      />,
    )
    expect(container.querySelector('[data-pw="modmail-resolve-button"]')).not.toBeNull()
  })

  it('hides resolve button for non-mods', () => {
    const { container } = render(
      <ModmailThreadClient
        communitySlug='test-community'
        thread={makeThread()}
        initialMessages={[]}
        initialHasMore={false}
        initialEndCursor={null}
        isMod={false}
      />,
    )
    expect(container.querySelector('[data-pw="modmail-resolve-button"]')).toBeNull()
  })

  it('hides resolve button and compose form when thread is resolved', () => {
    const { container } = render(
      <ModmailThreadClient
        communitySlug='test-community'
        thread={makeThread({ resolved_at: '2026-01-01T00:00:00Z' })}
        initialMessages={[]}
        initialHasMore={false}
        initialEndCursor={null}
        isMod
      />,
    )
    expect(container.querySelector('[data-pw="modmail-resolve-button"]')).toBeNull()
    expect(container.querySelector('[data-pw="modmail-compose-input"]')).toBeNull()
  })

  it('calls sendModmailMessage on form submit', async () => {
    mockSendModmailMessage.mockResolvedValueOnce({ message: makeMessage('new-msg') })
    const { container } = render(
      <ModmailThreadClient
        communitySlug='test-community'
        thread={makeThread()}
        initialMessages={[]}
        initialHasMore={false}
        initialEndCursor={null}
        isMod
      />,
    )

    const textarea = container.querySelector(
      '[data-pw="modmail-compose-input"]',
    ) as HTMLTextAreaElement
    fireEvent.change(textarea, { target: { value: 'Hello there' } })

    const form = textarea.closest('form')!
    fireEvent.submit(form)

    await waitFor(() => {
      expect(mockSendModmailMessage).toHaveBeenCalledWith(
        'test-community',
        'thread-1',
        'Hello there',
      )
    })
  })

  it('shows load more button when initialHasMore is true', () => {
    const { container } = render(
      <ModmailThreadClient
        communitySlug='test-community'
        thread={makeThread()}
        initialMessages={[]}
        initialHasMore
        initialEndCursor='cursor-1'
        isMod
      />,
    )
    expect(container.querySelector('[data-pw="modmail-thread-load-more"]')).not.toBeNull()
  })

  it('calls getModmailMessagesClient on load more click', async () => {
    mockGetModmailMessagesClient.mockResolvedValueOnce({
      results: [makeMessage('older-msg')],
      page_info: { has_next_page: false, end_cursor: null },
    })

    const { container } = render(
      <ModmailThreadClient
        communitySlug='test-community'
        thread={makeThread()}
        initialMessages={[makeMessage('msg-1')]}
        initialHasMore
        initialEndCursor='cursor-1'
        isMod
      />,
    )

    const loadMoreBtn = container.querySelector(
      '[data-pw="modmail-thread-load-more"]',
    ) as HTMLButtonElement
    fireEvent.click(loadMoreBtn)

    await waitFor(() => {
      expect(mockGetModmailMessagesClient).toHaveBeenCalledWith('test-community', 'thread-1', {
        after: 'cursor-1',
      })
    })
  })
})
