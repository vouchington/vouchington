import type { Notification } from './types.mts'

/** Looks up one catalog string; `notifications.kind.*` keys exist for every notification kind. */
export type NotificationTranslate = (
  key: string,
  parameters?: Record<string, string | number>,
) => string

export type NotificationText = { title: string; body: string }

export type Source = Pick<
  Notification,
  | 'kind'
  | 'params'
  | 'post_id'
  | 'top_post_id'
  | 'rss_feed_item_id'
  | 'actor_user_id'
  | 'sent_by_id'
  | 'community_id'
  | 'community_application_id'
  | 'review_dispute_id'
  | 'moderation_appeal_id'
  | 'user_warning_id'
  | 'copyright_notice_id'
  | 'copyright_notice_delivery_work_item_id'
>
