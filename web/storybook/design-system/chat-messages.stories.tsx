import type { Meta, StoryObj } from '@storybook/nextjs-vite'

import { ChatMessages } from '@/components/chat/chat-messages'
import type { ChatMessage, ChatSSEEventToolCall } from '@/types/chat'

const meta = {
  title: 'Design System/Chat/ChatMessages',
  component: ChatMessages,
  parameters: {
    layout: 'fullscreen',
  },
  args: {
    messages: [],
  },
} satisfies Meta<typeof ChatMessages>

export default meta
type Story = StoryObj<typeof meta>

const Frame = ({ children }: { children: React.ReactNode }) => (
  <main className='flex h-screen flex-col bg-background text-foreground'>
    <div className='mx-auto flex w-full max-w-3xl flex-1 flex-col overflow-hidden'>{children}</div>
  </main>
)

function makeMessage(id: string, content: ChatMessage['content']): ChatMessage {
  return {
    id,
    conversation_id: 'storybook-conversation',
    created_at: new Date().toISOString(),
    created_by_id: '00000000-0000-0000-0000-000000000000',
    updated_at: new Date().toISOString(),
    updated_by_id: null,
    deleted_at: null,
    deleted_by_id: null,
    content,
  }
}

const CONVERSATION_MESSAGES: ChatMessage[] = [
  makeMessage('msg-1', {
    role: 'user',
    content: 'What credit cards have the best travel rewards?',
  }),
  makeMessage('msg-2', {
    role: 'assistant',
    content:
      'Great question! The top travel rewards cards fall into a few categories. Premium cards like the Chase Sapphire Reserve and Amex Platinum offer strong earning rates on travel and dining, plus valuable perks like lounge access and travel credits. Mid-tier cards like the Chase Sapphire Preferred and Capital One Venture Rewards offer solid value with lower annual fees. The best card depends on your spending patterns and how much you value perks versus a lower annual fee.',
  }),
  makeMessage('msg-3', { role: 'user', content: 'Tell me more about the Chase Sapphire Reserve.' }),
  makeMessage('msg-4', {
    role: 'assistant',
    content:
      'The Chase Sapphire Reserve earns 3x points on travel and dining worldwide, plus 1x on everything else. It has a $550 annual fee, but a $300 travel credit offsets much of that cost. You also get Priority Pass lounge access, a Global Entry/TSA PreCheck credit, and strong trip protection insurance. Points transfer to 14 airline and hotel partners at 1:1, making them very flexible.',
  }),
  makeMessage('msg-5', { role: 'user', content: 'How does it compare to the Amex Platinum?' }),
  makeMessage('msg-6', {
    role: 'assistant',
    content:
      'Both are premium cards targeting frequent travelers. The Amex Platinum has a higher $695 annual fee but offers more credits — up to $200 airline fee credit, $200 hotel credit, $189 CLEAR credit, and more. Its lounge access network is broader, including Centurion Lounges. The Chase Sapphire Reserve earns better on dining and has simpler, more flexible travel credits. If you fly a lot and value lounges, Amex Platinum may win. For everyday travel flexibility, Sapphire Reserve is often preferred.',
  }),
]

const EMPTY_MESSAGES: ChatMessage[] = []

const TOOL_CALLS: ChatSSEEventToolCall[] = [
  {
    tool_call_id: 'call-1',
    name: 'search_credit_cards',
    arguments: JSON.stringify({ query: 'best travel rewards annual fee', limit: 5 }, null, 2),
  },
]

export const EmptyState: Story = {
  render: () => (
    <Frame>
      <ChatMessages
        messages={EMPTY_MESSAGES}
        isStreaming={false}
      />
    </Frame>
  ),
}

const SINGLE_USER_MESSAGE: ChatMessage[] = [
  makeMessage('msg-1', {
    role: 'user',
    content: 'What credit cards have the best travel rewards?',
  }),
]

export const SingleUserMessage: Story = {
  render: () => (
    <Frame>
      <ChatMessages
        messages={SINGLE_USER_MESSAGE}
        isStreaming={false}
      />
    </Frame>
  ),
}

export const Conversation: Story = {
  render: () => (
    <Frame>
      <ChatMessages
        messages={CONVERSATION_MESSAGES}
        isStreaming={false}
      />
    </Frame>
  ),
}

export const Streaming: Story = {
  render: () => (
    <Frame>
      <ChatMessages
        messages={CONVERSATION_MESSAGES.slice(0, 3)}
        isStreaming
        streamedContent='Thinking about your question...'
      />
    </Frame>
  ),
}

export const NullAssistantContent: Story = {
  render: () => (
    <Frame>
      <ChatMessages
        messages={[
          makeMessage('msg-1', { role: 'user', content: 'Can you help me?' }),
          makeMessage('msg-2', { role: 'assistant', content: null }),
        ]}
        isStreaming={false}
      />
    </Frame>
  ),
}

export const ErrorAssistantContent: Story = {
  render: () => (
    <Frame>
      <ChatMessages
        messages={[
          makeMessage('msg-1', { role: 'user', content: 'What are the best travel cards?' }),
          makeMessage('msg-2', {
            role: 'assistant',
            content: null,
            error: 'Request failed: Service Unavailable',
          }),
        ]}
        isStreaming={false}
      />
    </Frame>
  ),
}

export const StreamingWithToolCall: Story = {
  render: () => (
    <Frame>
      <ChatMessages
        messages={CONVERSATION_MESSAGES.slice(0, 1)}
        isStreaming
        streamingToolCalls={TOOL_CALLS}
        streamedContent=''
      />
    </Frame>
  ),
}
