import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { fn } from 'storybook/test'

import { ChatsSidebarGroupView } from '@/components/chat/chats-sidebar-group-view'
import { SidebarProvider } from '@/components/ui/sidebar'
import type { ChatConversation } from '@/types/chat'

const meta = {
  title: 'Chat/ChatsSidebarGroup',
  component: ChatsSidebarGroupView,
  parameters: {
    layout: 'fullscreen',
  },
  args: {
    conversations: [],
    pathname: '/chat',
    deletingId: null,
    editingId: null,
    editValue: '',
    showSupport: false,
    onDelete: fn(),
    onEditStart: fn(),
    onEditChange: fn(),
    onEditSave: fn(),
    onEditCancel: fn(),
  },
} satisfies Meta<typeof ChatsSidebarGroupView>

export default meta
type Story = StoryObj<typeof meta>

const Frame = ({ children }: { children: React.ReactNode }) => (
  <SidebarProvider defaultOpen>
    <aside className='min-h-screen w-72 border-r bg-sidebar text-sidebar-foreground'>
      {children}
    </aside>
  </SidebarProvider>
)

function makeConversation(id: string, title: string): ChatConversation {
  return {
    id,
    title,
    created_at: new Date().toISOString(),
    created_by_id: '00000000-0000-0000-0000-000000000000',
    updated_at: new Date().toISOString(),
    updated_by_id: null,
    deleted_at: null,
    deleted_by_id: null,
  }
}

const conversations = [
  makeConversation('019e0000-0000-7000-8000-000000000101', 'Travel rewards comparison'),
  makeConversation('019e0000-0000-7000-8000-000000000102', 'Chase Sapphire Reserve fees'),
  makeConversation('019e0000-0000-7000-8000-000000000103', 'Amex Platinum lounge access'),
]

export const Empty: Story = {
  render: args => (
    <Frame>
      <ChatsSidebarGroupView {...args} />
    </Frame>
  ),
}

export const WithConversations: Story = {
  render: args => (
    <Frame>
      <ChatsSidebarGroupView {...args} />
    </Frame>
  ),
  args: {
    conversations,
    pathname: '/chat/019e0000-0000-7000-8000-000000000102',
  },
}
