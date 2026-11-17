import type { NotificationsResponseBody } from '@/types/api-responses'

const reply = {
  id: '019f38fe-0000-7000-8000-0000000000n1',
  entity_type: 'post',
  kind: 'post_reply',
  params: {},
  post_id: 'fixture-reply',
  read_at: null,
  created_at: '2026-09-20T14:30:00.000Z',
  target_path: '/reviews/fixture-review',
} as unknown as NotificationsResponseBody['notifications'][string]

const follow = {
  id: '019f38fe-0000-7000-8000-0000000000n2',
  entity_type: 'follow',
  kind: 'follow',
  params: {},
  actor_user_id: 'user-alex',
  read_at: '2026-09-21T10:00:00.000Z',
  created_at: '2026-09-21T09:40:00.000Z',
  target_path: '/@alex',
} as unknown as NotificationsResponseBody['notifications'][string]

export const notificationsFixture: NotificationsResponseBody = {
  results: [reply, follow].map(notification => ({
    __entity_type: 'notification' as const,
    id: notification.id,
    read_at: notification.read_at,
  })),
  notifications: { [reply.id]: reply, [follow.id]: follow },
  communities: {},
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
  rss_feed_items: {},
  copyright_notices: {},
  public_texts: {},
  page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
}
