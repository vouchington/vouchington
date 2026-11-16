import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { EMPTY_NOTIFICATION_HYDRATION } from '@/components/notifications/empty-notification-hydration'
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
    kind: 'follow' as const,
    params: {},
    actor_user_id: 'user-alex',
    read_at: null,
    created_at: '2026-05-10T12:00:00.000Z',
    target_path: '/user/alex',
  },
  'notif-post': {
    id: 'notif-post',
    entity_type: 'post' as const,
    kind: 'post_new' as const,
    params: {},
    post_id: 'post-community',
    read_at: '2026-05-09T08:30:00.000Z',
    created_at: '2026-05-09T08:00:00.000Z',
    target_path: '/posts/some-post',
  },
  'notif-referral': {
    id: 'notif-referral',
    entity_type: 'referral_signup' as const,
    kind: 'referral_signup' as const,
    params: { referral_count: 3 },
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
              ...EMPTY_NOTIFICATION_HYDRATION,
              actors: { 'user-alex': { id: 'user-alex', username: 'alex' } },
              posts: {
                'post-community': {
                  id: 'post-community',
                  post_type: 'discussion',
                  snippet: 'Which card do you use for groceries?',
                  actor_user_id: 'user-alex',
                  community_id: null,
                },
              },
            }}
            onOpen={() => undefined}
            onDelete={() => undefined}
          />
        </div>
        <div className='w-full max-w-sm overflow-hidden rounded-lg border bg-card sm:max-w-none'>
          <NotificationList
            notifications={{ results: [], notifications: {}, ...EMPTY_NOTIFICATION_HYDRATION }}
            onOpen={() => undefined}
            onDelete={() => undefined}
          />
        </div>
      </div>
    </EntityStoryFrame>
  ),
}
