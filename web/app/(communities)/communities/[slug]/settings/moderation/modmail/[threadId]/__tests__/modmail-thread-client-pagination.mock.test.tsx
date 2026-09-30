import { render } from '@testing-library/react'
import { describe, vi } from 'vitest'
import type { ModmailMessage, ModmailThread } from '@/lib/api/client/modmail'
import { registerPaginationClientTests } from '@/test-helpers/app/pagination-client-tests'

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
  registerPaginationClientTests({
    loadMoreButton: container => container.querySelector('[data-pw="modmail-thread-load-more"]'),
    fetchPage: mockGetModmailMessagesClient,
    onError: mockOnError,
    renderInitial: renderThread,
    rerenderOtherContext(rerender) {
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
    },
    duplicatedOlderMessages: () => [
      makeMessage('older'),
      makeMessage('older'),
      makeMessage('newest'),
    ],
    olderMessage: () => makeMessage('older'),
    staleMessage: () => makeMessage('stale'),
    staleContextName: 'thread',
  })
})
