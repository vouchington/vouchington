import { render } from '@testing-library/react'
import { describe, vi } from 'vitest'
import type { DirectMessage } from '@/types/messages'
import { registerPaginationClientTests } from '@/test-helpers/app/pagination-client-tests'

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
  registerPaginationClientTests({
    loadMoreButton: container => container.querySelector('[data-pw="dm-load-more-button"]'),
    fetchPage: mockGetDirectMessageThreadClient,
    onError: mockOnError,
    renderInitial: renderConversation,
    rerenderOtherContext(rerender) {
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
    },
    duplicatedOlderMessages: () => [
      makeMessage('older'),
      makeMessage('older'),
      makeMessage('newest'),
    ],
    olderMessage: () => makeMessage('older'),
    staleMessage: () => makeMessage('stale'),
    staleContextName: 'conversation',
  })
})
