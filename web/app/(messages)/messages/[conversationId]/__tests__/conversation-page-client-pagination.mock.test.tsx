import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DirectMessage } from '@/types/messages'

interface MessagePage {
  results: DirectMessage[]
  page_info: {
    has_next_page: boolean
    start_cursor: string | null
    end_cursor: string | null
  }
}

const { mockGetDirectMessageThreadClient, mockOnError } = vi.hoisted(() => ({
  mockGetDirectMessageThreadClient: vi.fn<VitestLooseMock>(),
  mockOnError: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/api/client/messages'), () => ({
  getDirectMessageThreadClient: mockGetDirectMessageThreadClient,
  sendDirectMessage: vi.fn<VitestLooseMock>(),
}))
vi.mock(import('@/lib/on-error'), () => ({ default: mockOnError }))
vi.mock(import('@/lib/navigation/use-resolved-breadcrumbs'), () => ({
  useResolvedBreadcrumbs: vi.fn<VitestLooseMock>().mockReturnValue([]),
}))
vi.mock(import('@/components/page-with-aside'), () => ({
  PageWithAside: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))
vi.mock(import('@/components/ui/breadcrumb'), () => ({ Breadcrumbs: () => <nav /> }))
vi.mock(import('@/components/shared/time-ago'), () => ({ TimeAgo: () => <time>now</time> }))
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

import { DirectMessagePageClient } from '../conversation-page-client'

function makeMessage(id: string, conversationId = 'conversation-one'): DirectMessage {
  return {
    id,
    conversation_id: conversationId,
    body_text: `Message ${id}`,
    created_by_id: 'user-1',
    created_at: '2026-01-01T00:00:00Z',
  }
}

function makePage(
  results: DirectMessage[],
  hasNextPage: boolean,
  endCursor: string | null,
): MessagePage {
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

function renderConversation(
  overrides: Partial<React.ComponentProps<typeof DirectMessagePageClient>> = {},
) {
  return render(
    <DirectMessagePageClient
      conversationId='conversation-one'
      currentUserId='user-1'
      initialMessages={[makeMessage('newest')]}
      initialHasMore
      initialEndCursor='cursor-one'
      initialParticipants={[]}
      isOwner={false}
      initialParticipantAddPolicy='owner_only'
      {...overrides}
    />,
  )
}

describe('DirectMessagePageClient pagination', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('allows only one continuation request for rapid clicks', async () => {
    const pending = deferred<MessagePage>()
    mockGetDirectMessageThreadClient.mockReturnValueOnce(pending.promise)
    const { container } = renderConversation()
    const button = container.querySelector('[data-pw="dm-load-more-button"]')!

    fireEvent.click(button)
    fireEvent.click(button)

    expect(mockGetDirectMessageThreadClient).toHaveBeenCalledTimes(1)
    pending.resolve(makePage([], false, null))
    await waitFor(() =>
      expect(container.querySelector('[data-pw="dm-load-more-button"]')).toBeNull(),
    )
  })

  it('deduplicates stable IDs across and within an older page', async () => {
    mockGetDirectMessageThreadClient.mockResolvedValueOnce(
      makePage([makeMessage('older'), makeMessage('older'), makeMessage('newest')], false, null),
    )
    const { container } = renderConversation()

    fireEvent.click(container.querySelector('[data-pw="dm-load-more-button"]')!)

    await waitFor(() => expect(screen.getAllByText('Message older')).toHaveLength(1))
    expect(screen.getAllByText('Message newest')).toHaveLength(1)
  })

  it('rejects a continuation response from a stale conversation context', async () => {
    const pending = deferred<MessagePage>()
    mockGetDirectMessageThreadClient.mockReturnValueOnce(pending.promise)
    const { container, rerender } = renderConversation()
    fireEvent.click(container.querySelector('[data-pw="dm-load-more-button"]')!)

    rerender(
      <DirectMessagePageClient
        key='conversation-two'
        conversationId='conversation-two'
        currentUserId='user-1'
        initialMessages={[makeMessage('fresh', 'conversation-two')]}
        initialHasMore={false}
        initialEndCursor={null}
        initialParticipants={[]}
        isOwner={false}
        initialParticipantAddPolicy='owner_only'
      />,
    )
    pending.resolve(makePage([makeMessage('stale')], false, null))

    await waitFor(() => expect(screen.getByText('Message fresh')).toBeDefined())
    expect(screen.queryByText('Message stale')).toBeNull()
  })

  it('preserves messages and shows a working retry after continuation failure', async () => {
    const error = new Error('network failure')
    mockGetDirectMessageThreadClient
      .mockRejectedValueOnce(error)
      .mockResolvedValueOnce(makePage([makeMessage('older')], false, null))
    const { container } = renderConversation()

    fireEvent.click(container.querySelector('[data-pw="dm-load-more-button"]')!)
    const retry = await screen.findByRole('button', { name: 'Retry' })
    expect(screen.getByText('Message newest')).toBeDefined()
    expect(mockOnError).toHaveBeenCalledWith(error, expect.any(Object))

    fireEvent.click(retry)
    await waitFor(() => expect(screen.getByText('Message older')).toBeDefined())
    expect(mockGetDirectMessageThreadClient).toHaveBeenCalledTimes(2)
  })
})
