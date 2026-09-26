import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { NotificationRow } from '@/components/notifications/notification-row'
import { StoryFrame } from '@/storybook/story-frame'
import type { NotificationListNotification } from '@/components/notifications/notification-list'

const meta = {
  title: 'Notifications/Notification Row',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

const reply: NotificationListNotification = {
  id: '019f38fe-0000-7000-8000-0000000000n1',
  entity_type: 'post',
  title: 'Alex Morgan replied to your Sapphire Reserve review',
  body: 'The restaurant category still earns 3x on the card I keep.',
  read_at: null,
  created_at: '2026-09-20T14:30:00.000Z',
  target_path: '/reviews/fixture-review',
}

const follow: NotificationListNotification = {
  id: '019f38fe-0000-7000-8000-0000000000n2',
  entity_type: 'follow',
  title: 'Alex Morgan followed you',
  body: '',
  read_at: '2026-09-21T10:00:00.000Z',
  created_at: '2026-09-21T09:40:00.000Z',
  target_path: '/@alex',
}

export const UnreadReply: Story = {
  render: () => (
    <StoryFrame width='max-w-xl'>
      <NotificationRow
        notification={reply}
        onOpen={() => {}}
        onDelete={() => {}}
      />
    </StoryFrame>
  ),
}

export const ReadFollow: Story = {
  render: () => (
    <StoryFrame width='max-w-xl'>
      <NotificationRow
        notification={follow}
        onOpen={() => {}}
        onDelete={() => {}}
      />
    </StoryFrame>
  ),
}
