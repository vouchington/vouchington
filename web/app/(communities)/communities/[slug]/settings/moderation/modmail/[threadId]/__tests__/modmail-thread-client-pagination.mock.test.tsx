import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  ModmailMessage,
  ModmailMessagesResponseBody,
  ModmailThread,
} from '@/lib/api/client/modmail'

const { mockGetModmailMessagesClient, mockOnError } = vi.hoisted(() => ({
  mockGetModmailMessagesClient: vi.fn<VitestLooseMock>(),
  mockOnError: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/api/client/modmail'), () => ({
  getModmailMessagesClient: mockGetModmailMessagesClient,
  sendModmailMessage: vi.fn<VitestLooseMock>(),
  resolveModmailThread: vi.fn<VitestLooseMock>(),
}))
vi.mock(import('@/lib/on-error'), () => ({ default: mockOnError }))
vi.mock(import('@/components/shared/time-ago'), () => ({ TimeAgo: () => <time>now</time> }))
vi.mock(
  import('@/components/ui/badge'),
  () =>
    ({
      Badge: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
    }) as unknown as typeof import('@/components/ui/badge'),
)
vi.mock(
  import('@/components/ui/textarea'),
  () =>
    ({
      Textarea: (props: React.ComponentProps<'textarea'>) => <textarea {...props} />,
    }) as unknown as typeof import('@/components/ui/textarea'),
)
vi.mock(
  import('@/components/ui/button'),
  () =>
    ({
      Button: ({
        children,
        loading: _loading,
        type: _type,
        ...props
      }: React.ComponentProps<'button'> & { loading?: boolean }) => (
        <button
          type='button'
          {...props}
        >
          {children}
        </button>
      ),
    }) as unknown as typeof import('@/components/ui/button'),
)

import { ModmailThreadClient } from '../modmail-thread-client'

function makeThread(id: string): ModmailThread {
  return {
    id,
    channel_type: 'modmail',
    title: `Thread ${id}`,
    community_id: 'community-1',
    subject_user_id: 'subject-1',
    assigned_mod_id: null,
    assigned_at: null,
    resolved_at: null,
    resolved_by_id: null,
    created_by_id: 'subject-1',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  }
}

function makeMessage(id: string, conversationId = 'thread-one'): ModmailMessage {
  return {
    id,
    conversation_id: conversationId,
    body_text: `Message ${id}`,
    created_by_id: 'user-1',
    created_at: '2026-01-01T00:00:00Z',
  }
}

function makePage(
  results: ModmailMessage[],
  hasNextPage: boolean,
  endCursor: string | null,
): ModmailMessagesResponseBody {
  return {
    results,
    page_info: {
      has_next_page: hasNextPage,
      start_cursor: results.length > 0 ? `start-${results[0]!.id}` : null,
      end_cursor: endCursor,
    },
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(res => {
    resolve = res
  })
  return { promise, resolve }
}

function renderThread(overrides: Partial<React.ComponentProps<typeof ModmailThreadClient>> = {}) {
  return render(
    <ModmailThreadClient
      communitySlug='community-one'
      thread={makeThread('thread-one')}
      initialMessages={[makeMessage('newest')]}
      initialHasMore
      initialEndCursor='cursor-one'
      isMod
      {...overrides}
    />,
  )
}

describe('ModmailThreadClient pagination', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('allows only one continuation request for rapid clicks', async () => {
    const pending = deferred<ModmailMessagesResponseBody>()
    mockGetModmailMessagesClient.mockReturnValueOnce(pending.promise)
    const { container } = renderThread()
    const button = container.querySelector('[data-pw="modmail-thread-load-more"]')!

    fireEvent.click(button)
    fireEvent.click(button)

    expect(mockGetModmailMessagesClient).toHaveBeenCalledTimes(1)
    pending.resolve(makePage([], false, null))
    await waitFor(() =>
      expect(container.querySelector('[data-pw="modmail-thread-load-more"]')).toBeNull(),
    )
  })

  it('deduplicates stable IDs across and within an older page', async () => {
    mockGetModmailMessagesClient.mockResolvedValueOnce(
      makePage([makeMessage('older'), makeMessage('older'), makeMessage('newest')], false, null),
    )
    const { container } = renderThread()

    fireEvent.click(container.querySelector('[data-pw="modmail-thread-load-more"]')!)

    await waitFor(() => expect(screen.getAllByText('Message older')).toHaveLength(1))
    expect(screen.getAllByText('Message newest')).toHaveLength(1)
  })

  it('rejects a continuation response from a stale thread context', async () => {
    const pending = deferred<ModmailMessagesResponseBody>()
    mockGetModmailMessagesClient.mockReturnValueOnce(pending.promise)
    const { container, rerender } = renderThread()
    fireEvent.click(container.querySelector('[data-pw="modmail-thread-load-more"]')!)

    rerender(
      <ModmailThreadClient
        key='community-two:thread-two'
        communitySlug='community-two'
        thread={makeThread('thread-two')}
        initialMessages={[makeMessage('fresh', 'thread-two')]}
        initialHasMore={false}
        initialEndCursor={null}
        isMod
      />,
    )
    pending.resolve(makePage([makeMessage('stale')], false, null))

    await waitFor(() => expect(screen.getByText('Message fresh')).toBeDefined())
    expect(screen.queryByText('Message stale')).toBeNull()
  })

  it('preserves messages and shows a working retry after continuation failure', async () => {
    const error = new Error('network failure')
    mockGetModmailMessagesClient
      .mockRejectedValueOnce(error)
      .mockResolvedValueOnce(makePage([makeMessage('older')], false, null))
    const { container } = renderThread()

    fireEvent.click(container.querySelector('[data-pw="modmail-thread-load-more"]')!)
    const retry = await screen.findByRole('button', { name: 'Retry' })
    expect(screen.getByText('Message newest')).toBeDefined()
    expect(mockOnError).toHaveBeenCalledWith(error, expect.any(Object))

    fireEvent.click(retry)
    await waitFor(() => expect(screen.getByText('Message older')).toBeDefined())
    expect(mockGetModmailMessagesClient).toHaveBeenCalledTimes(2)
  })
})
