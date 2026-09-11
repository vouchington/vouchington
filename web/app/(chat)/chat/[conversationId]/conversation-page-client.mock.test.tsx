import type { ReactNode } from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { navMockModule, createNavMock } from '@/test-helpers/next-navigation-mock'
import { useChatStream } from '@/hooks/use-chat-stream'
import type { ChatMessage } from '@/types/chat'
import { ConversationPageClient } from './conversation-page-client'

vi.mock(
  import('next/navigation'),
  () => navMockModule as unknown as typeof import('next/navigation'),
)

const mockSendMessage = vi.fn<VitestLooseMock>()
const generateConversationTitleMock = vi.hoisted(() => vi.fn<VitestLooseMock>())
const mockNav = createNavMock()

vi.mock(import('@/hooks/use-chat-stream'), () => ({
  useChatStream: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/api/client/conversations'), () => ({
  generateConversationTitle: generateConversationTitleMock,
  updateConversationTitle: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/components/chat/chat-layout'), () => ({
  ChatLayout: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))

vi.mock(import('@/components/chat/chat-messages'), () => ({
  ChatMessages: ({ messages }: { messages: ChatMessage[] }) => (
    <div>
      <div data-testid='message-count'>{messages.length}</div>
      <div data-testid='message-content'>
        {messages.map(message => JSON.stringify(message.content))}
      </div>
      <div data-testid='message-ids'>{messages.map(message => message.id).join(',')}</div>
    </div>
  ),
}))

vi.mock(import('@/components/chat/chat-input'), () => ({
  ChatInput: () => <form aria-label='chat input' />,
}))

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

describe('ConversationPageClient', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockNav.reset()
    mockNav.setPathname('/chat/conversation-1')
    mockNav.setSearchParams('message=hello')
    window.history.replaceState(null, '', '/chat/conversation-1?message=hello#top')
    vi.mocked(useChatStream).mockReturnValue({
      sendMessage: mockSendMessage.mockResolvedValue(undefined),
      isStreaming: false,
      streamedContent: '',
      toolCalls: [],
      subagentSteps: [],
      subagentTextChunks: [],
      metadata: {},
      error: null,
      abort: vi.fn<VitestLooseMock>(),
    })
  })

  it('sends and removes an initial pending message exactly once', async () => {
    const { rerender } = render(
      <ConversationPageClient
        conversationId='conversation-1'
        initialMessages={[makeMessage('message-1')]}
      />,
    )

    await waitFor(() => {
      expect(mockSendMessage).toHaveBeenCalledWith('conversation-1', 'hello')
    })
    expect(window.location.pathname + window.location.search + window.location.hash).toBe(
      '/chat/conversation-1#top',
    )

    rerender(
      <ConversationPageClient
        conversationId='conversation-1'
        initialMessages={[makeMessage('message-1')]}
      />,
    )

    expect(mockSendMessage).toHaveBeenCalledTimes(1)
  })

  it('adds an error bubble when streaming ends with error and a metadata messageId', async () => {
    mockNav.setSearchParams()
    vi.mocked(useChatStream).mockReturnValue({
      sendMessage: vi.fn<VitestLooseMock>().mockResolvedValue(undefined),
      isStreaming: false,
      streamedContent: '',
      toolCalls: [],
      subagentSteps: [],
      subagentTextChunks: [],
      metadata: { messageId: 'assistant-1' },
      error: 'Request failed: Service Unavailable',
      abort: vi.fn<VitestLooseMock>(),
    })

    render(
      <ConversationPageClient
        conversationId='conversation-1'
        initialMessages={[makeMessage('message-1')]}
      />,
    )

    // Error bubble added via queueMicrotask — initial=1, after effect=2
    await waitFor(() => {
      expect(screen.getByTestId('message-count')).toHaveTextContent('2')
    })
    // Error banner suppressed when error is already surfaced as a bubble (metadata.messageId set)
    expect(screen.queryByText('Request failed: Service Unavailable')).toBeNull()
  })

  it('commits partial content and an error in the metadata assistant bubble', async () => {
    mockNav.setSearchParams()
    window.history.replaceState(null, '', '/chat/conversation-1')
    vi.mocked(useChatStream).mockReturnValue({
      sendMessage: vi.fn<VitestLooseMock>().mockResolvedValue(undefined),
      isStreaming: false,
      streamedContent: 'partial response text',
      toolCalls: [],
      subagentSteps: [],
      subagentTextChunks: [],
      metadata: { messageId: 'assistant-2' },
      error: 'Stream interrupted',
      abort: vi.fn<VitestLooseMock>(),
    })

    render(
      <ConversationPageClient
        conversationId='conversation-1'
        initialMessages={[]}
      />,
    )

    await waitFor(() => {
      expect(screen.getByTestId('message-count')).toHaveTextContent('1')
    })
    expect(screen.getByTestId('message-content')).toHaveTextContent(
      '{"role":"assistant","content":"partial response text","error":"Stream interrupted"}',
    )
    expect(screen.getByTestId('message-ids')).toHaveTextContent('assistant-2')
    expect(generateConversationTitleMock).not.toHaveBeenCalled()
  })

  it('keeps a metadata-less partial response banner-only', () => {
    mockNav.setSearchParams()
    vi.mocked(useChatStream).mockReturnValue({
      sendMessage: vi.fn<VitestLooseMock>().mockResolvedValue(undefined),
      isStreaming: false,
      streamedContent: 'partial response text',
      toolCalls: [],
      subagentSteps: [],
      subagentTextChunks: [],
      metadata: {},
      error: 'Stream interrupted',
      abort: vi.fn<VitestLooseMock>(),
    })

    render(
      <ConversationPageClient
        conversationId='conversation-1'
        initialMessages={[makeMessage('message-1')]}
      />,
    )

    expect(screen.getByText('Stream interrupted')).toBeInTheDocument()
    expect(screen.getByTestId('message-count')).toHaveTextContent('1')
    expect(screen.getByTestId('message-content')).not.toHaveTextContent('partial response text')
  })

  it('commits whitespace-only partial content as null with a metadata error', async () => {
    mockNav.setSearchParams()
    vi.mocked(useChatStream).mockReturnValue({
      sendMessage: vi.fn<VitestLooseMock>().mockResolvedValue(undefined),
      isStreaming: false,
      streamedContent: '  \n  ',
      toolCalls: [],
      subagentSteps: [],
      subagentTextChunks: [],
      metadata: { messageId: 'assistant-3' },
      error: 'Stream interrupted',
      abort: vi.fn<VitestLooseMock>(),
    })

    render(
      <ConversationPageClient
        conversationId='conversation-1'
        initialMessages={[makeMessage('message-1')]}
      />,
    )

    await waitFor(() => {
      expect(screen.getByTestId('message-count')).toHaveTextContent('2')
    })
    expect(screen.getByTestId('message-content')).toHaveTextContent(
      '{"role":"assistant","content":null,"error":"Stream interrupted"}',
    )
  })

  it('shows error banner when streaming fails before stream starts (no metadata messageId)', () => {
    mockNav.setSearchParams()
    vi.mocked(useChatStream).mockReturnValue({
      sendMessage: vi.fn<VitestLooseMock>().mockResolvedValue(undefined),
      isStreaming: false,
      streamedContent: '',
      toolCalls: [],
      subagentSteps: [],
      subagentTextChunks: [],
      metadata: {},
      error: 'Unexpected response format',
      abort: vi.fn<VitestLooseMock>(),
    })

    render(
      <ConversationPageClient
        conversationId='conversation-1'
        initialMessages={[makeMessage('message-1')]}
      />,
    )

    // No messageId → error banner visible; no bubble added
    expect(screen.getByText('Unexpected response format')).toBeInTheDocument()
    expect(screen.getByTestId('message-count')).toHaveTextContent('1')
  })

  it('sends an initial pending message only from the active conversation path', async () => {
    window.history.replaceState(null, '', '/chat/conversation-1?message=hello')

    render(
      <>
        <ConversationPageClient
          conversationId='conversation-1'
          initialMessages={[makeMessage('message-1')]}
        />
        <ConversationPageClient
          conversationId='conversation-2'
          initialMessages={[makeMessage('message-2')]}
        />
      </>,
    )

    await waitFor(() => {
      expect(mockSendMessage).toHaveBeenCalledWith('conversation-1', 'hello')
    })
    expect(mockSendMessage).toHaveBeenCalledTimes(1)
  })
})
