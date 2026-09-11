import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { fn, within, userEvent } from 'storybook/test'

import { ChatInput } from '@/components/chat/chat-input'

const meta = {
  title: 'Design System/Chat/ChatInput',
  component: ChatInput,
  args: {
    onSend: fn(),
    onAbort: fn(),
    isStreaming: false,
  },
} satisfies Meta<typeof ChatInput>

export default meta
type Story = StoryObj<typeof meta>

const Frame = ({ children }: { children: React.ReactNode }) => (
  <main className='min-h-screen bg-background text-foreground'>
    <div className='mx-auto flex max-w-3xl flex-col'>{children}</div>
  </main>
)

export const Default: Story = {
  render: args => (
    <Frame>
      <ChatInput {...args} />
    </Frame>
  ),
}

export const WithText: Story = {
  render: args => (
    <Frame>
      <ChatInput {...args} />
    </Frame>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const textarea = canvas.getByRole('textbox', { name: /chat message/i })
    await userEvent.type(
      textarea,
      'Which credit card has the best travel rewards for international trips?',
    )
  },
}

export const Streaming: Story = {
  render: args => (
    <Frame>
      <ChatInput {...args} />
    </Frame>
  ),
  args: {
    isStreaming: true,
  },
}

export const Disabled: Story = {
  render: args => (
    <Frame>
      <ChatInput {...args} />
    </Frame>
  ),
  args: {
    disabled: true,
  },
}
