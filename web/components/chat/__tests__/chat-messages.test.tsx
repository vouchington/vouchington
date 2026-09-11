import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { ChatMessage } from '@/types/chat'
import { ChatMessages } from '../chat-messages'

function makeMessage(id: string, role: 'user' | 'assistant', content: string): ChatMessage {
  return {
    id,
    conversation_id: 'conv-1',
    created_at: '2024-01-01T00:00:00Z',
    created_by_id: 'user-1',
    updated_at: '2024-01-01T00:00:00Z',
    updated_by_id: null,
    deleted_at: null,
    deleted_by_id: null,
    content: { role, content },
  }
}

describe('ChatMessages', () => {
  it('shows empty state when there are no messages and not streaming', () => {
    render(
      <ChatMessages
        messages={[]}
        isStreaming={false}
      />,
    )
    expect(screen.getByText('Start a conversation')).toBeInTheDocument()
    expect(
      screen.getByText('Ask anything about credit cards, rewards, or financial decisions.'),
    ).toBeInTheDocument()
  })

  it('renders a user message on the right side', () => {
    const messages = [makeMessage('1', 'user', 'Hello there')]
    render(
      <ChatMessages
        messages={messages}
        isStreaming={false}
      />,
    )
    expect(screen.getByText('Hello there')).toBeInTheDocument()
    const bubble = screen.getByText('Hello there').closest('div[class*="justify-end"]')
    expect(bubble).not.toBeNull()
  })

  it('renders an assistant message on the left side', () => {
    const messages = [makeMessage('1', 'assistant', 'Here is my answer')]
    render(
      <ChatMessages
        messages={messages}
        isStreaming={false}
      />,
    )
    expect(screen.getByText('Here is my answer')).toBeInTheDocument()
    expect(document.querySelector('[data-pw="chat-message-content"]')).not.toBeNull()
    expect(document.querySelector('[data-pw="chat-message-error"]')).toBeNull()
    const bubble = screen.getByText('Here is my answer').closest('div[class*="justify-start"]')
    expect(bubble).not.toBeNull()
  })

  it('renders alternating user and assistant messages', () => {
    const messages = [
      makeMessage('1', 'user', 'What cards have travel rewards?'),
      makeMessage('2', 'assistant', 'Chase Sapphire is a great choice.'),
      makeMessage('3', 'user', 'What about the annual fee?'),
    ]
    render(
      <ChatMessages
        messages={messages}
        isStreaming={false}
      />,
    )
    expect(screen.getByText('What cards have travel rewards?')).toBeInTheDocument()
    expect(screen.getByText('Chase Sapphire is a great choice.')).toBeInTheDocument()
    expect(screen.getByText('What about the annual fee?')).toBeInTheDocument()
  })

  it('shows loading dots when streaming with no streamed content yet', () => {
    render(
      <ChatMessages
        messages={[]}
        isStreaming
        streamedContent=''
      />,
    )
    const dots = document.querySelectorAll('.animate-bounce')
    expect(dots.length).toBe(3)
  })

  it('shows subagent child text separately from streamed content', () => {
    render(
      <ChatMessages
        messages={[]}
        isStreaming
        streamedContent='Final answer'
        subagentTextChunks={[
          { agent_name: 'research', tool_call_id: 'call_1', content: 'Checking ' },
          { agent_name: 'research', tool_call_id: 'call_1', content: 'sources' },
        ]}
      />,
    )

    expect(screen.getByText('Checking sources')).toBeInTheDocument()
    expect(screen.getByText('Final answer')).toBeInTheDocument()
  })

  it('shows streamed content when streaming is in progress', () => {
    render(
      <ChatMessages
        messages={[]}
        isStreaming
        streamedContent='Thinking about your question...'
      />,
    )
    expect(screen.getByText('Thinking about your question...')).toBeInTheDocument()
  })

  it('makes the message scroll container keyboard focusable', () => {
    const messages = [makeMessage('1', 'user', 'hi')]
    render(
      <ChatMessages
        messages={messages}
        isStreaming={false}
      />,
    )
    expect(document.querySelector('[data-pw="chat-messages"]')).toHaveAccessibleName('Messages')
    expect(document.querySelector('[data-pw="chat-messages"]')).toHaveAttribute('role', 'log')
    expect(document.querySelector('[data-pw="chat-messages"]')).toHaveAttribute('tabindex', '0')
  })

  it('does not name the generic empty-state container', () => {
    render(
      <ChatMessages
        messages={[]}
        isStreaming={false}
      />,
    )

    expect(document.querySelector('[data-pw="chat-messages"]')).not.toHaveAttribute('aria-label')
  })

  it('disables live announcements while response content streams', () => {
    render(
      <ChatMessages
        messages={[]}
        isStreaming
        streamedContent='Partial response'
      />,
    )

    expect(document.querySelector('[data-pw="chat-messages"]')).toHaveAttribute('aria-live', 'off')
  })

  it('skips messages with malformed content without throwing', () => {
    const badMessage = {
      ...makeMessage('bad', 'user', 'ignored'),
      content: null as unknown as ChatMessage['content'],
    }
    const goodMessage = makeMessage('good', 'user', 'visible message')
    expect(() =>
      render(
        <ChatMessages
          messages={[badMessage, goodMessage]}
          isStreaming={false}
        />,
      ),
    ).not.toThrow()
    expect(screen.getByText('visible message')).toBeInTheDocument()
  })

  it('renders no bubble for assistant message with null content and no error (aborted stream)', () => {
    const nullContentMessage: ChatMessage = {
      id: 'null-1',
      conversation_id: 'conv-1',
      created_at: '2024-01-01T00:00:00Z',
      created_by_id: 'user-1',
      updated_at: '2024-01-01T00:00:00Z',
      updated_by_id: null,
      deleted_at: null,
      deleted_by_id: null,
      content: { role: 'assistant', content: null },
    }
    const { container } = render(
      <ChatMessages
        messages={[nullContentMessage]}
        isStreaming={false}
      />,
    )
    expect(container.querySelector('[data-pw="chat-message-assistant"]')).toBeNull()
  })

  it('renders no bubble for assistant message with whitespace-only content and no error', () => {
    const whitespaceMessage: ChatMessage = {
      id: 'ws-1',
      conversation_id: 'conv-1',
      created_at: '2024-01-01T00:00:00Z',
      created_by_id: 'user-1',
      updated_at: '2024-01-01T00:00:00Z',
      updated_by_id: null,
      deleted_at: null,
      deleted_by_id: null,
      content: { role: 'assistant', content: '   \n  ' },
    }
    const { container } = render(
      <ChatMessages
        messages={[whitespaceMessage]}
        isStreaming={false}
      />,
    )
    expect(container.querySelector('[data-pw="chat-message-assistant"]')).toBeNull()
  })

  it('renders assistant error content', () => {
    const errorMessage: ChatMessage = {
      id: 'err-1',
      conversation_id: 'conv-1',
      created_at: '2024-01-01T00:00:00Z',
      created_by_id: 'user-1',
      updated_at: '2024-01-01T00:00:00Z',
      updated_by_id: null,
      deleted_at: null,
      deleted_by_id: null,
      content: { role: 'assistant', content: null, error: 'Something went wrong' },
    }
    render(
      <ChatMessages
        messages={[errorMessage]}
        isStreaming={false}
      />,
    )
    expect(screen.getByText('Something went wrong')).toBeInTheDocument()
    expect(document.querySelector('[data-pw="chat-message-error"]')).not.toBeNull()
    expect(document.querySelector('[data-pw="chat-message-content"]')).toBeNull()
  })

  it('renders partial assistant content above its error', () => {
    const message: ChatMessage = {
      ...makeMessage('partial-1', 'assistant', 'Partial response'),
      content: {
        role: 'assistant',
        content: 'Partial response',
        error: 'The response was interrupted. Please try again.',
      },
    }
    render(
      <ChatMessages
        messages={[message]}
        isStreaming={false}
      />,
    )
    const bubble = document.querySelector('[data-pw="chat-message-assistant"]')
    const content = bubble?.querySelector('[data-pw="chat-message-content"]')
    const error = bubble?.querySelector('[data-pw="chat-message-error"]')
    if (!content || !error)
      throw new Error('Expected partial content and error in the assistant bubble')
    expect(content).toHaveTextContent('Partial response')
    expect(error).toHaveTextContent('The response was interrupted. Please try again.')
    expect(content.compareDocumentPosition(error) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0)
  })
})
