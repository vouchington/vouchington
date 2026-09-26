import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { MessagesSidebarGroupView } from '@/components/messages/messages-sidebar-group-view'
import { SidebarProvider } from '@/components/ui/sidebar'
import type { DirectConversation } from '@/types/messages'
import { StoryFrame } from '@/storybook/story-frame'

const meta = {
  title: 'Messages/Messages Sidebar Group View',
  component: MessagesSidebarGroupView,
} satisfies Meta<typeof MessagesSidebarGroupView>

export default meta
type Story = StoryObj<typeof meta>

const conversation: DirectConversation = {
  id: 'conversation-card-chat',
  channel_type: 'direct_message',
  title: 'Sapphire Reserve referral questions',
  created_at: '2026-05-01T12:00:00.000Z',
  updated_at: '2026-05-20T12:00:00.000Z',
}

export const WithConversation: Story = {
  args: { conversations: [conversation], pathname: '/messages' },
  render: args => (
    <StoryFrame width='max-w-xs'>
      <SidebarProvider className='min-h-0'>
        <MessagesSidebarGroupView {...args} />
      </SidebarProvider>
    </StoryFrame>
  ),
}

export const Empty: Story = {
  args: { conversations: [], pathname: '/messages' },
  render: args => (
    <StoryFrame width='max-w-xs'>
      <SidebarProvider className='min-h-0'>
        <MessagesSidebarGroupView {...args} />
      </SidebarProvider>
    </StoryFrame>
  ),
}
