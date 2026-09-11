import { isValidElement, type ReactElement, type ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ChatMessage } from '@/types/chat'

const { mockGetMyConversationMessages, mockNotFound } = vi.hoisted(() => ({
  mockGetMyConversationMessages: vi.fn<VitestLooseMock>(),
  mockNotFound: vi.fn<VitestLooseMock>(() => {
    throw new Error('NEXT_NOT_FOUND')
  }),
}))

vi.mock(
  import('next/navigation'),
  () =>
    ({
      notFound: mockNotFound,
    }) as unknown as typeof import('next/navigation'),
)

vi.mock(import('@/lib/api/server/conversations'), () => ({
  getMyConversationMessages: mockGetMyConversationMessages,
}))

vi.mock(import('@/lib/seo/metadata'), () => ({
  createNoIndexMetadata: vi.fn<VitestLooseMock>(() => ({})),
}))

vi.mock(import('@/components/chat/chat-conversation-page'), () => ({
  ChatConversationPage: ({ children }: { children: ReactNode }) => <main>{children}</main>,
}))

vi.mock(
  import('./conversation-page-client'),
  () =>
    ({
      ConversationPageClient: () => null,
    }) as unknown as typeof import('./conversation-page-client'),
)

import ConversationPage from './page'
import { ConversationPageClient } from './conversation-page-client'

function findElementByType(node: ReactNode, type: unknown): ReactElement | null {
  if (!isValidElement(node)) return null
  if (node.type === type) return node

  const { children } = node.props as { children?: ReactNode }
  if (Array.isArray(children)) {
    for (const child of children) {
      const found = findElementByType(child, type)
      if (found) return found
    }
    return null
  }

  return findElementByType(children, type)
}

function makeMessage(id: string): ChatMessage {
  return {
    id,
    conversation_id: 'conversation-1',
    created_at: '2026-05-20T00:00:00.000Z',
    created_by_id: 'user-1',
    updated_at: '2026-05-20T00:00:00.000Z',
    updated_by_id: null,
    deleted_at: null,
    deleted_by_id: null,
    content: { role: 'user', content: 'Existing message' },
  }
}

describe('ConversationPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('keys the client page by conversation id so route changes reset client state', async () => {
    mockGetMyConversationMessages.mockResolvedValue({
      results: [makeMessage('message-1')],
    })

    const result = await ConversationPage({
      params: Promise.resolve({ conversationId: 'conversation-1' }),
    })

    const client = findElementByType(result, ConversationPageClient)
    expect(client?.key).toBe('conversation-1')
  })
})
