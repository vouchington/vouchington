import type { PaginatedResult } from '../pagination.mts'

export type Notification = {
  __entity_type: 'notification'
  id: string
  user_id: string
  entity_type:
    | 'post'
    | 'rss_feed_item'
    | 'follow'
    | 'referral_signup'
    | 'referral_click'
    | 'moderation_report'
    | 'review_dispute'
    | 'user_warning'
    | 'direct_message'
    | 'modmail'
    | 'critical_moderation_alert'
    | 'community_application_decision'
    | 'community_role_change'
    | 'community_ownership_transfer'
    | 'community_activity_digest'
    | 'copyright_notice'
  post_id: string | null
  rss_feed_item_id: string | null
  actor_user_id: string | null
  moderation_report_id: string | null
  review_dispute_id: string | null
  user_warning_id: string | null
  conversation_id: string | null
  community_id: string | null
  copyright_notice_id: string | null
  event_key: string | null
  title: string
  body: string
  actor_label: string | null
  target_path: string | null
  target_entity: { __entity_type: 'community'; id: string } | null
  target_intent: 'notifications_inbox' | null
  read_at: Date | null
  pushed_at: Date | null
  created_at: Date
  updated_at: Date
}

export type NotificationResult = PaginatedResult<'notification'> & {
  read_at: Date | null
}

export type WebPushSubscriptionRecord = {
  __entity_type: 'web_push_subscription'
  id: string
  user_id: string
  endpoint: string
  p256dh: string
  auth: string
  expiration_time_ms: string | null
  user_agent: string
  last_success_at: Date | null
  last_failure_at: Date | null
  created_at: Date
  updated_at: Date
}
