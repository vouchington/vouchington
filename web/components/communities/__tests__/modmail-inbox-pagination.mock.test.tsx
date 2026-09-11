import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ModmailInboxResponseBody, ModmailThread } from '@/lib/api/client/modmail'

const { mockGetModmailInboxClient, mockOnError } = vi.hoisted(() => ({
  mockGetModmailInboxClient: vi.fn<VitestLooseMock>(),
  mockOnError: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/api/client/modmail'), () => ({
  getModmailInboxClient: mockGetModmailInboxClient,
}))

vi.mock(import('@/lib/on-error'), () => ({ default: mockOnError }))

vi.mock(
  import('next/link'),
  () =>
    ({
      default: ({ children, href, ...props }: React.ComponentProps<'a'>) => (
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
        loading: _loading,
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

vi.mock(
  import('@/components/ui/badge'),
  () =>
    ({
      Badge: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
    }) as unknown as typeof import('@/components/ui/badge'),
)

vi.mock(import('@/components/shared/time-ago'), () => ({ TimeAgo: () => <time>now</time> }))

import { ModmailInbox } from '../modmail-inbox'

function makeThread(id: string): ModmailThread {
  return {
    id,
    channel_type: 'modmail',
    title: `Thread ${id}`,
    community_id: 'community-1',
    subject_user_id: `user-${id}`,
    assigned_mod_id: null,
    assigned_at: null,
    resolved_at: null,
    resolved_by_id: null,
    created_by_id: `user-${id}`,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  }
}

function makePage(
  results: ModmailThread[],
  hasNextPage: boolean,
  endCursor: string | null,
): ModmailInboxResponseBody {
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
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, reject, resolve }
}

describe('ModmailInbox pagination', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('allows only one continuation request for rapid clicks', async () => {
    const pending = deferred<ModmailInboxResponseBody>()
    mockGetModmailInboxClient.mockReturnValueOnce(pending.promise)
    const { container } = render(
      <ModmailInbox
        communitySlug='community-one'
        initialData={makePage([makeThread('one')], true, 'cursor-one')}
      />,
    )

    const button = screen.getByRole('button', { name: 'Load more' })
    fireEvent.click(button)
    fireEvent.click(button)

    expect(mockGetModmailInboxClient).toHaveBeenCalledTimes(1)
    pending.resolve(makePage([], false, null))
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Load more' })).toBeNull())
  })

  it('deduplicates stable IDs across and within a continuation page', async () => {
    mockGetModmailInboxClient.mockResolvedValueOnce(
      makePage([makeThread('one'), makeThread('two'), makeThread('two')], false, null),
    )
    const { container } = render(
      <ModmailInbox
        communitySlug='community-one'
        initialData={makePage([makeThread('one')], true, 'cursor-one')}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Load more' }))

    await waitFor(() => expect(screen.getAllByText('User: user-two')).toHaveLength(1))
    expect(screen.getAllByText('User: user-one')).toHaveLength(1)
  })

  it('rejects a continuation response from a stale community context', async () => {
    const pending = deferred<ModmailInboxResponseBody>()
    mockGetModmailInboxClient.mockReturnValueOnce(pending.promise)
    const { container, rerender } = render(
      <ModmailInbox
        communitySlug='community-one'
        initialData={makePage([makeThread('one')], true, 'cursor-one')}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Load more' }))

    rerender(
      <ModmailInbox
        key='community-two'
        communitySlug='community-two'
        initialData={makePage([makeThread('fresh')], false, null)}
      />,
    )
    pending.resolve(makePage([makeThread('stale')], false, null))

    await waitFor(() => expect(screen.getByText('User: user-fresh')).toBeDefined())
    expect(screen.queryByText('User: user-stale')).toBeNull()
  })

  it('preserves rows and shows a working retry after continuation failure', async () => {
    const error = new Error('network failure')
    mockGetModmailInboxClient
      .mockRejectedValueOnce(error)
      .mockResolvedValueOnce(makePage([makeThread('two')], false, null))
    const { container } = render(
      <ModmailInbox
        communitySlug='community-one'
        initialData={makePage([makeThread('one')], true, 'cursor-one')}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Load more' }))
    const retry = await screen.findByRole('button', { name: 'Retry' })
    expect(screen.getByText('User: user-one')).toBeDefined()
    expect(mockOnError).toHaveBeenCalledWith(error, expect.any(Object))

    fireEvent.click(retry)
    await waitFor(() => expect(screen.getByText('User: user-two')).toBeDefined())
    expect(mockGetModmailInboxClient).toHaveBeenCalledTimes(2)
  })

  it('retries a failed server-rendered first page without an after cursor', async () => {
    mockGetModmailInboxClient.mockResolvedValueOnce(makePage([makeThread('one')], false, null))
    render(
      <ModmailInbox
        communitySlug='community-one'
        initialData={null}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))

    await waitFor(() => expect(screen.getByText('User: user-one')).toBeDefined())
    expect(mockGetModmailInboxClient).toHaveBeenCalledWith('community-one')
  })
})
