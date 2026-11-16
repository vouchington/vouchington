import type { Notification } from '@/types/api-responses'

/** The fields a row needs: the kind and params to render, and the ids to look up hydrated facts. */
export type NotificationListNotification = Pick<
  Notification,
  'id' | 'entity_type' | 'kind' | 'params' | 'read_at' | 'created_at' | 'target_path'
> &
  Partial<
    Pick<
      Notification,
      | 'target_entity'
      | 'target_intent'
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
  >
