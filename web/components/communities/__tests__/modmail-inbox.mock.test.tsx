import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockGetModmailInboxClient, mockOnError } = vi.hoisted(() => ({
  mockGetModmailInboxClient: vi.fn<VitestLooseMock>(),
  mockOnError: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/api/client/modmail'), () => ({
  getModmailInboxClient: mockGetModmailInboxClient,
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
  import('@/components/ui/badge'),
  () =>
    ({
      Badge: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
    }) as unknown as typeof import('@/components/ui/badge'),
)

vi.mock(import('@/components/shared/time-ago'), () => ({
  TimeAgo: () => <time>now</time>,
}))

vi.mock(
  import('@/components/ui/button'),
  () =>
    ({
      Button: ({
        children,
        onClick,
        disabled,
        ...rest
      }: {
        children: React.ReactNode
        onClick?: () => void
        disabled?: boolean
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

import { ModmailInbox } from '../modmail-inbox'
import type { ModmailThread } from '@/lib/api/client/modmail'

const emptyResponse = {
  results: [],
  page_info: { has_next_page: false, start_cursor: null, end_cursor: null },
}

function makeThread(overrides: Partial<ModmailThread> = {}): ModmailThread {
  return {
    id: 'thread-1',
    channel_type: 'modmail',
    title: 'Thread subject',
    subject_user_id: 'user-1',
    resolved_at: null,
    created_at: '2026-01-01T00:00:00Z',
    community_id: 'c1',
    assigned_mod_id: null,
    assigned_at: null,
    resolved_by_id: null,
    created_by_id: 'user-1',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

describe('ModmailInbox', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('renders empty state when no threads', async () => {
    render(
      <ModmailInbox
        communitySlug='test-community'
        initialData={emptyResponse}
      />,
    )
    await waitFor(() => {
      expect(screen.getByText('No modmail threads yet.')).toBeDefined()
    })
  })

  it('renders thread items when threads exist', async () => {
    const initialData = {
      results: [makeThread()],
      page_info: { has_next_page: false, start_cursor: 'start-1', end_cursor: null },
    }
    render(
      <ModmailInbox
        communitySlug='test-community'
        initialData={initialData}
      />,
    )
    await waitFor(() => {
      expect(screen.getByTestId !== undefined).toBe(true)
      expect(screen.getByText(/user-1/i)).toBeDefined()
    })
  })

  it('renders modmail-inbox-item data-pw attribute on thread links', async () => {
    const initialData = {
      results: [makeThread()],
      page_info: { has_next_page: false, start_cursor: 'start-1', end_cursor: null },
    }
    const { container } = render(
      <ModmailInbox
        communitySlug='test-community'
        initialData={initialData}
      />,
    )
    await waitFor(() => {
      expect(container.querySelector('[data-pw="modmail-inbox-item"]')).not.toBeNull()
    })
  })

  it('shows load more button when has_next_page is true', async () => {
    const initialData = {
      results: [makeThread()],
      page_info: { has_next_page: true, start_cursor: 'start-1', end_cursor: 'cursor-1' },
    }
    render(
      <ModmailInbox
        communitySlug='test-community'
        initialData={initialData}
      />,
    )
    expect(await screen.findByRole('button', { name: 'Load more' })).toBeVisible()
  })

  it('does not show load more button when has_next_page is false', async () => {
    const initialData = {
      results: [makeThread()],
      page_info: { has_next_page: false, start_cursor: 'start-1', end_cursor: null },
    }
    render(
      <ModmailInbox
        communitySlug='test-community'
        initialData={initialData}
      />,
    )
    expect(screen.queryByRole('button', { name: 'Load more' })).toBeNull()
  })

  it('renders retry when the server-rendered first page failed', () => {
    render(
      <ModmailInbox
        communitySlug='test-community'
        initialData={null}
      />,
    )
    expect(screen.getByRole('button', { name: 'Retry' })).toBeDefined()
    expect(screen.queryByText('No modmail threads yet.')).toBeNull()
  })

  it('loads more threads when load more button is clicked', async () => {
    const firstThread = makeThread({ id: 'thread-1', subject_user_id: 'user-1' })
    const secondThread = makeThread({ id: 'thread-2', subject_user_id: 'user-2' })
    mockGetModmailInboxClient.mockResolvedValueOnce({
      results: [secondThread],
      page_info: { has_next_page: false, start_cursor: 'start-2', end_cursor: null },
    })

    render(
      <ModmailInbox
        communitySlug='test-community'
        initialData={{
          results: [firstThread],
          page_info: { has_next_page: true, start_cursor: 'start-1', end_cursor: 'cursor-1' },
        }}
      />,
    )

    fireEvent.click(await screen.findByRole('button', { name: 'Load more' }))

    await waitFor(() => {
      expect(mockGetModmailInboxClient).toHaveBeenCalledWith('test-community', {
        after: 'cursor-1',
      })
    })
  })

  it('calls onError when load more fails', async () => {
    const loadErr = new Error('load more error')
    mockGetModmailInboxClient.mockRejectedValueOnce(loadErr)

    render(
      <ModmailInbox
        communitySlug='test-community'
        initialData={{
          results: [makeThread()],
          page_info: { has_next_page: true, start_cursor: 'start-1', end_cursor: 'cursor-1' },
        }}
      />,
    )

    fireEvent.click(await screen.findByRole('button', { name: 'Load more' }))

    await waitFor(() => {
      expect(mockOnError).toHaveBeenCalledWith(
        loadErr,
        expect.objectContaining({ fallback: 'Failed to load more threads' }),
      )
    })
  })

  it('renders anonymous thread when subject_user_id is null', async () => {
    const initialData = {
      results: [makeThread({ subject_user_id: null })],
      page_info: { has_next_page: false, start_cursor: 'start-1', end_cursor: null },
    }
    render(
      <ModmailInbox
        communitySlug='test-community'
        initialData={initialData}
      />,
    )
    await waitFor(() => {
      expect(screen.getByText('Anonymous request')).toBeDefined()
    })
  })
})
