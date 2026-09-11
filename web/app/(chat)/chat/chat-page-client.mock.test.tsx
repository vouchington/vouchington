import { fireEvent, render, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import { ChatSidebarProvider } from '@/lib/chat-sidebar-context'
import { useChatSidebar } from '@/lib/use-chat-sidebar'
import { createConversation } from '@/lib/api/client/conversations'
import { ChatPageClient } from './chat-page-client'
import type { ChatConversation } from '@/types/chat'

const pushMock = vi.hoisted(() => vi.fn<(href: string) => void>())

vi.mock(
  import('next/navigation'),
  () =>
    ({
      useRouter: () => ({ push: pushMock }),
    }) as unknown as typeof import('next/navigation'),
)

vi.mock(import('@/lib/api/client/conversations'), () => ({
  createConversation: vi.fn<VitestLooseMock>(),
}))

vi.mock(
  import('@/hooks/use-chat-stream'),
  () =>
    ({
      useChatStream: () => ({
        isStreaming: false,
        abort: vi.fn<() => void>(),
      }),
    }) as unknown as typeof import('@/hooks/use-chat-stream'),
)

vi.mock(import('@/components/chat/chat-layout'), () => ({
  ChatLayout: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))

vi.mock(import('@/components/chat/chat-messages'), () => ({
  ChatMessages: () => <div />,
}))

vi.mock(import('@/components/chat/chat-input'), () => ({
  ChatInput: ({ onSend }: { onSend: (message: string) => void }) => (
    <button
      type='button'
      onClick={() => onSend('New chat title')}
    >
      Send
    </button>
  ),
}))

function makeConversation(): ChatConversation {
  return {
    id: 'conv-new',
    title: 'New chat title',
    created_at: '',
    created_by_id: 'user-1',
    updated_at: '',
    updated_by_id: null,
    deleted_at: null,
    deleted_by_id: null,
  }
}

describe('ChatPageClient', () => {
  it('prepends the created conversation before navigating', async () => {
    vi.mocked(createConversation).mockResolvedValue({ conversation: makeConversation() })
    let sidebarConversations: ChatConversation[] = []

    const { getByText } = render(
      <ChatSidebarProvider>
        <CaptureSidebarConversations onChange={value => (sidebarConversations = value)} />
        <ChatPageClient />
      </ChatSidebarProvider>,
    )

    fireEvent.click(getByText('Send'))

    await waitFor(() => {
      expect(sidebarConversations.map(conversation => conversation.id)).toEqual(['conv-new'])
      expect(pushMock).toHaveBeenCalledWith('/chat/conv-new?message=New%20chat%20title')
    })
  })
})

function CaptureSidebarConversations({
  onChange,
}: {
  onChange: (conversations: ChatConversation[]) => void
}) {
  onChange(useChatSidebar().conversations)
  return null
}
