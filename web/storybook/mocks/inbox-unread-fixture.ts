import type { NotificationsUnreadSummaryResponseBody } from '@/types/api-responses'

export function inboxUnreadFixture(): NotificationsUnreadSummaryResponseBody {
  return {
    unread_count: 1,
    results: [{ __entity_type: 'notification', id: 'notif-follow', read_at: null }],
    notifications: {
      'notif-follow': {
        __entity_type: 'notification',
        id: 'notif-follow',
        user_id: 'user-cardholder',
        entity_type: 'follow',
        post_id: null,
        rss_feed_item_id: null,
        actor_user_id: null,
        moderation_report_id: null,
        review_dispute_id: null,
        user_warning_id: null,
        conversation_id: null,
        community_id: null,
        copyright_notice_id: null,
        event_key: null,
        title: '@alex started following you',
        body: 'Alex Morgan followed your profile.',
        actor_label: null,
        target_path: '/user/alex',
        target_entity: null,
        target_intent: null,
        read_at: null,
        pushed_at: null,
        created_at: '2026-05-10T12:00:00.000Z',
        updated_at: '2026-05-10T12:00:00.000Z',
      },
    },
    communities: {},
  }
}
