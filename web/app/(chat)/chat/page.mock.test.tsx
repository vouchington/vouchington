import { isValidElement, type ReactElement, type ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'

const { mockGetMyConversations } = vi.hoisted(() => ({
  mockGetMyConversations: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/api/server/conversations'), () => ({
  getMyConversations: mockGetMyConversations,
}))

vi.mock(import('@/lib/seo/metadata'), () => ({
  createNoIndexMetadata: vi.fn<VitestLooseMock>(() => ({})),
}))

vi.mock(import('@/components/chat/chat-conversation-page'), () => ({
  ChatConversationPage: ({ children }: { children: ReactNode }) => <main>{children}</main>,
}))

vi.mock(
  import('./chat-page-client'),
  () =>
    ({
      ChatPageClient: () => null,
    }) as unknown as typeof import('./chat-page-client'),
)

import ChatPage from './page'
import { ChatPageClient } from './chat-page-client'

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

describe('ChatPage', () => {
  it('does not preload conversations on the server and renders the chat client without preload props', async () => {
    const result = await ChatPage()

    expect(mockGetMyConversations).not.toHaveBeenCalled()

    const client = findElementByType(result, ChatPageClient)
    expect(client).not.toBeNull()
    expect(client?.props).not.toHaveProperty('initialConversations')
  })
})
