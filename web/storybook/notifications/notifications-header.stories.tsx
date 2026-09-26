import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { NotificationsHeader } from '@/components/notifications/notifications-header'
import { StoryFrame } from '@/storybook/story-frame'

const meta = {
  title: 'Notifications/Notifications Header',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const UnreadInbox: Story = {
  render: () => (
    <StoryFrame>
      <NotificationsHeader
        canMarkAllRead
        onMarkAllRead={() => {}}
      />
    </StoryFrame>
  ),
}

export const AllRead: Story = {
  render: () => (
    <StoryFrame>
      <NotificationsHeader
        canMarkAllRead={false}
        onMarkAllRead={() => {}}
      />
    </StoryFrame>
  ),
}
