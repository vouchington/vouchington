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
  kind: 'post_reply',
  params: {},
  post_id: 'fixture-reply',
  read_at: null,
  created_at: '2026-09-20T14:30:00.000Z',
  target_path: '/reviews/fixture-review',
}

const follow: NotificationListNotification = {
  id: '019f38fe-0000-7000-8000-0000000000n2',
  entity_type: 'follow',
  kind: 'follow',
  params: {},
  actor_user_id: 'user-alex',
  read_at: '2026-09-21T10:00:00.000Z',
  created_at: '2026-09-21T09:40:00.000Z',
  target_path: '/@alex',
}

const hydration = {
  actors: { 'user-alex': { id: 'user-alex', username: 'alex' } },
  posts: {
    'fixture-reply': {
      id: 'fixture-reply',
      post_type: 'comment',
      snippet: 'The restaurant category still earns 3x on the card I keep.',
      actor_user_id: 'user-alex',
      community_id: null,
    },
  },
}

export const UnreadReply: Story = {
  render: () => (
    <StoryFrame width='max-w-xl'>
      <NotificationRow
        notification={reply}
        hydration={hydration}
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
        hydration={hydration}
        onOpen={() => {}}
        onDelete={() => {}}
      />
    </StoryFrame>
  ),
}
