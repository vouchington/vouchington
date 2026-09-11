import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { NotificationList } from '@/components/notifications/notification-list'
import { EntityStoryFrame } from './entity-story-frame'
import { storyCurrentUser } from './entity-fixtures'

const meta = {
  title: 'Entities/Users',
  parameters: { auth: { currentUser: storyCurrentUser } },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

const notificationFixtures = {
  'notif-follow': {
    id: 'notif-follow',
    entity_type: 'follow' as const,
    title: '@alex started following you',
    body: 'Alex Morgan followed your profile.',
    read_at: null,
    created_at: '2026-05-10T12:00:00.000Z',
    target_path: '/user/alex',
  },
  'notif-post': {
    id: 'notif-post',
    entity_type: 'post' as const,
    title: 'New post in your community',
    body: '',
    read_at: '2026-05-09T08:30:00.000Z',
    created_at: '2026-05-09T08:00:00.000Z',
    target_path: '/posts/some-post',
  },
  'notif-referral': {
    id: 'notif-referral',
    entity_type: 'referral_signup' as const,
    title: 'Someone signed up via your referral',
    body: 'You earned a referral credit.',
    read_at: null,
    created_at: '2026-05-08T16:45:00.000Z',
    target_path: '/my/referrals',
  },
}

export const Notifications: Story = {
  render: () => (
    <EntityStoryFrame title='Notifications'>
      <div className='space-y-4'>
        <div className='w-full max-w-sm overflow-hidden rounded-lg border bg-card sm:max-w-none'>
          <NotificationList
            notifications={{
              results: [{ id: 'notif-follow' }, { id: 'notif-post' }, { id: 'notif-referral' }],
              notifications: notificationFixtures,
            }}
            onOpen={() => undefined}
            onDelete={() => undefined}
          />
        </div>
        <div className='w-full max-w-sm overflow-hidden rounded-lg border bg-card sm:max-w-none'>
          <NotificationList
            notifications={{ results: [], notifications: {} }}
            onOpen={() => undefined}
            onDelete={() => undefined}
          />
        </div>
      </div>
    </EntityStoryFrame>
  ),
}
