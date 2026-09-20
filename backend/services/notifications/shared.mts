import type { Notification, WebPushSubscriptionRecord } from './types.mts'

export function truncateText(value: string | null | undefined, maxLength: number): string {
  const trimmed = (value ?? '').replace(/\s+/g, ' ').trim()
  if (!trimmed) return ''
  if (trimmed.length <= maxLength) return trimmed
  return `${trimmed.slice(0, maxLength - 1).trimEnd()}…`
}

export function getPostRouteSlug(postType: string): string {
  switch (postType) {
    case 'review':
      return 'review'
    case 'data_point':
      return 'data-point'
    case 'link':
      return 'link'
    default:
      return 'discussion'
  }
}

export function mapNotificationRow(row: Record<string, unknown>): Notification {
  const notificationId = row.id as string
  const entityType = row.entity_type as Notification['entity_type']
  return {
    __entity_type: 'notification',
    id: notificationId,
    user_id: row.user_id as string,
    entity_type: entityType,
    post_id: (row.post_id as string | null) ?? null,
    rss_feed_item_id: (row.rss_feed_item_id as string | null) ?? null,
    actor_user_id: (row.actor_user_id as string | null) ?? null,
    moderation_report_id: (row.moderation_report_id as string | null) ?? null,
    review_dispute_id: (row.review_dispute_id as string | null) ?? null,
    user_warning_id: (row.user_warning_id as string | null) ?? null,
    conversation_id: (row.conversation_id as string | null) ?? null,
    community_id: (row.community_id as string | null) ?? null,
    copyright_notice_id: (row.copyright_notice_id as string | null) ?? null,
    event_key: (row.event_key as string | null) ?? null,
    title: row.title as string,
    body: row.body as string,
    actor_label: (row.actor_label as string | null) ?? null,
    target_path: getNotificationTargetPath(
      notificationId,
      entityType,
      (row.target_path as string | null) ?? null,
    ),
    target_entity: (row.target_entity as Notification['target_entity'] | null | undefined) ?? null,
    target_intent: (row.target_intent as Notification['target_intent'] | null | undefined) ?? null,
    read_at: (row.read_at as Date | null) ?? null,
    pushed_at: (row.pushed_at as Date | null) ?? null,
    created_at: row.created_at as Date,
    updated_at: row.updated_at as Date,
  }
}

export function mapWebPushSubscriptionRow(row: Record<string, unknown>): WebPushSubscriptionRecord {
  return {
    __entity_type: 'web_push_subscription',
    id: row.id as string,
    user_id: row.user_id as string,
    endpoint: row.endpoint as string,
    p256dh: row.p256dh as string,
    auth: row.auth as string,
    expiration_time_ms: (row.expiration_time_ms as string | null) ?? null,
    user_agent: row.user_agent as string,
    last_success_at: (row.last_success_at as Date | null) ?? null,
    last_failure_at: (row.last_failure_at as Date | null) ?? null,
    created_at: row.created_at as Date,
    updated_at: row.updated_at as Date,
  }
}

export function getNotificationTargetPath(
  notificationId: string,
  entityType: Notification['entity_type'],
  targetPath: string | null,
) {
  if (entityType === 'rss_feed_item') {
    return `/notification-redirect?notification_id=${encodeURIComponent(notificationId)}`
  }
  if (entityType === 'user_warning') {
    return '/my/warnings'
  }
  if (!targetPath) return null
  return targetPath
}
