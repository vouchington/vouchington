import type { ReactNode } from 'react'
import { render, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { navMockModule, createNavMock } from '@/test-helpers/next-navigation-mock'
import { useChatStream } from '@/hooks/use-chat-stream'
import { ConversationPageClient } from '../conversation-page-client'

vi.mock(
  import('next/navigation'),
  () => navMockModule as unknown as typeof import('next/navigation'),
)

const mockSendMessage = vi.fn<VitestLooseMock>()
const mockGenerateTitle = vi.hoisted(() => vi.fn<VitestLooseMock>())
const mockUpdateTitle = vi.hoisted(() => vi.fn<VitestLooseMock>())
const mockCaptureException = vi.hoisted(() => vi.fn<VitestLooseMock>())
const mockUseChatSidebar = vi.hoisted(() => vi.fn<VitestLooseMock>())
const mockNav = createNavMock()

vi.mock(import('@sentry/nextjs'), () => ({ captureException: mockCaptureException }))
vi.mock(import('@/hooks/use-chat-stream'), () => ({ useChatStream: vi.fn<VitestLooseMock>() }))
vi.mock(import('@/lib/use-chat-sidebar'), () => ({ useOptionalChatSidebar: mockUseChatSidebar }))
vi.mock(import('@/lib/api/client/conversations'), () => ({
  generateConversationTitle: mockGenerateTitle,
  updateConversationTitle: mockUpdateTitle,
}))
vi.mock(import('@/components/chat/chat-layout'), () => ({
  ChatLayout: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))
vi.mock(import('@/components/chat/chat-messages'), () => ({ ChatMessages: () => <div /> }))
vi.mock(import('@/components/chat/chat-input'), () => ({ ChatInput: () => <div /> }))

function setChatStream(streamedContent: string) {
  vi.mocked(useChatStream).mockReturnValue({
    sendMessage: mockSendMessage.mockResolvedValue(undefined),
    isStreaming: false,
    streamedContent,
    toolCalls: [],
    subagentSteps: [],
    subagentTextChunks: [],
    metadata: {},
    error: null,
    abort: vi.fn<VitestLooseMock>(),
  })
}

describe('ConversationPageClient title and send error reporting', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGenerateTitle.mockReset().mockResolvedValue('Generated title')
    mockUpdateTitle.mockReset().mockResolvedValue(undefined)
    mockUseChatSidebar.mockReset().mockReturnValue(null)
    mockNav.reset()
    mockNav.setPathname('/chat/conversation-1')
    mockNav.setSearchParams('message=hello')
    window.history.replaceState(null, '', '/chat/conversation-1?message=hello')
    setChatStream('')
  })

  it('reports a failed best-effort fallback title update after preserving the sidebar title', async () => {
    const titleError = new Error('title update failed')
    const updateConversation = vi.fn<VitestLooseMock>()
    mockUseChatSidebar.mockReturnValue({ conversations: [], updateConversation })
    mockGenerateTitle.mockRejectedValue(new Error('title generation failed'))
    mockUpdateTitle.mockRejectedValue(titleError)

    const { rerender } = render(
      <ConversationPageClient
        conversationId='conversation-1'
        initialMessages={[]}
      />,
    )
    await waitFor(() => expect(mockSendMessage).toHaveBeenCalledWith('conversation-1', 'hello'))

    setChatStream('assistant reply')
    rerender(
      <ConversationPageClient
        conversationId='conversation-1'
        initialMessages={[]}
      />,
    )

    await waitFor(() => {
      expect(mockUpdateTitle).toHaveBeenCalledWith('conversation-1', 'hello')
      expect(mockCaptureException).toHaveBeenCalledWith(titleError)
    })
    expect(updateConversation).toHaveBeenCalledWith('conversation-1', { title: 'hello' })
  })

  it('reports a rejected pending-message send without leaving an unhandled rejection', async () => {
    const sendError = new Error('send failed')
    mockSendMessage.mockRejectedValue(sendError)

    render(
      <ConversationPageClient
        conversationId='conversation-1'
        initialMessages={[]}
      />,
    )

    await waitFor(() => {
      expect(mockSendMessage).toHaveBeenCalledWith('conversation-1', 'hello')
      expect(mockCaptureException).toHaveBeenCalledWith(sendError)
    })
  })
})
