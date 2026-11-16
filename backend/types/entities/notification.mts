import type { PaginatedResult } from '../pagination.mts'

export type NotificationKind =
  | 'post_new'
  | 'post_reply'
  | 'post_manual_send'
  | 'post_removed'
  | 'rss_item_new'
  | 'rss_item_manual_send'
  | 'follow'
  | 'follow_referral_signup'
  | 'referral_signup'
  | 'referral_click'
  | 'report_reviewed'
  | 'critical_moderation_alert'
  | 'review_dispute_resolved'
  | 'review_actioned_removed'
  | 'review_actioned_note'
  | 'user_warning'
  | 'moderation_appeal_resolved'
  | 'community_ban'
  | 'direct_message'
  | 'modmail'
  | 'community_application_approved'
  | 'community_application_rejected'
  | 'community_role_changed'
  | 'community_ownership_received'
  | 'community_ownership_transferred_away'
  | 'community_activity_digest'
  | 'household_invitation'
  | 'copyright_claimant_receipt'
  | 'copyright_status_update'
  | 'copyright_poster_restriction_notice'
  | 'copyright_poster_review_notice'
  | 'copyright_poster_restoration_notice'
  | 'copyright_owner_information_notice'
  | 'copyright_claimant_decision_notice'
  | 'copyright_redress_decision_notice'

/** Small non-entity facts for a kind; the database validates the exact keys per kind. */
export type NotificationParams = Record<string, string | number | boolean>

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
    | 'moderation_appeal'
    | 'community_ban'
    | 'direct_message'
    | 'modmail'
    | 'critical_moderation_alert'
    | 'community_application_decision'
    | 'community_role_change'
    | 'community_ownership_transfer'
    | 'community_activity_digest'
    | 'household_invitation'
    | 'copyright_notice'
  kind: NotificationKind
  params: NotificationParams
  post_id: string | null
  rss_feed_item_id: string | null
  actor_user_id: string | null
  sent_by_id: string | null
  moderation_report_id: string | null
  review_dispute_id: string | null
  user_warning_id: string | null
  moderation_appeal_id: string | null
  conversation_id: string | null
  community_id: string | null
  community_application_id: string | null
  household_id: string | null
  copyright_notice_id: string | null
  copyright_notice_delivery_work_item_id: string | null
  top_post_id: string | null
  event_key: string | null
  target_path: string | null
  target_entity: { __entity_type: 'community' | 'household'; id: string } | null
  target_intent: 'notifications_inbox' | null
  read_at: Date | null
  pushed_at: Date | null
  created_at: Date
  updated_at: Date
}

export type NotificationActor = { id: string; username: string }

/** Live post facts; an anonymous post has no actor and a removed post is absent. */
export type NotificationPost = {
  id: string
  post_type: string
  snippet: string
  actor_user_id: string | null
  community_id: string | null
}

export type NotificationRssFeedItem = { id: string; feed_name: string; snippet: string }

export type NotificationCopyrightNotice = { id: string; jurisdiction: string }

export type NotificationCommunity = { id: string; slug: string; name: string }

/** Facts read live by id for one page of notifications; a missing key means the source is gone. */
export type NotificationHydration = {
  communities: Record<string, NotificationCommunity>
  actors: Record<string, NotificationActor>
  posts: Record<string, NotificationPost>
  rss_feed_items: Record<string, NotificationRssFeedItem>
  copyright_notices: Record<string, NotificationCopyrightNotice>
  /** Moderator-authored text keyed by its owning row id (dispute, appeal, warning, application or copyright delivery). */
  public_texts: Record<string, string>
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
