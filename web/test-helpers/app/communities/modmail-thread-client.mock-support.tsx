import type { ReactNode } from 'react'
import { vi } from 'vitest'
import type { ModmailMessage, ModmailThread } from '@/lib/api/client/modmail'

const {
  mockGetModmailMessagesClient,
  mockSendModmailMessage,
  mockResolveModmailThread,
  mockOnError,
} = vi.hoisted(() => ({
  mockGetModmailMessagesClient: vi.fn<VitestLooseMock>(),
  mockSendModmailMessage: vi.fn<VitestLooseMock>(),
  mockResolveModmailThread: vi.fn<VitestLooseMock>(),
  mockOnError: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/api/client/modmail'), () => ({
  getModmailMessagesClient: mockGetModmailMessagesClient,
  sendModmailMessage: mockSendModmailMessage,
  resolveModmailThread: mockResolveModmailThread,
}))

vi.mock(import('@/lib/on-error'), () => ({
  default: mockOnError,
}))

vi.mock(
  import('@/components/ui/badge'),
  () =>
    ({
      Badge: ({ children }: { children: ReactNode }) => <span>{children}</span>,
    }) as unknown as typeof import('@/components/ui/badge'),
)

vi.mock(import('@/components/shared/time-ago'), () => ({
  TimeAgo: () => <time>now</time>,
}))

function makeThread(overrides: Partial<ModmailThread> = {}): ModmailThread {
  return {
    id: 'thread-1',
    channel_type: 'modmail',
    title: 'Thread subject',
    community_id: 'c1',
    subject_user_id: 'user-subject',
    assigned_moderator_user_id: null,
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

export {
  makeMessage,
  makeThread,
  mockGetModmailMessagesClient,
  mockOnError,
  mockResolveModmailThread,
  mockSendModmailMessage,
}
