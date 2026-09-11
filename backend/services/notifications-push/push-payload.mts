import { getNotificationTargetPath } from '@services/notifications/shared'
import type { PushSubscriptionRow } from './push-intent-results.mts'

export type PushPayloadNotification = {
  id: string
  entity_type: Parameters<typeof getNotificationTargetPath>[1]
  title: string
  body: string
  target_path: string | null
  target_entity: unknown | null
  target_intent: string | null
  community_slug: string | null
}

export function buildNotificationPushPayload(
  notification: PushPayloadNotification,
  subscription: Pick<PushSubscriptionRow, 'endpoint' | 'id'>,
): string {
  const structured = notification.target_entity !== null || notification.target_intent !== null
  const targetIntent =
    notification.target_intent ??
    (notification.target_entity && !notification.community_slug ? 'notifications_inbox' : null)
  const targetEntity =
    notification.target_entity && notification.community_slug
      ? { ...(notification.target_entity as object), slug: notification.community_slug }
      : notification.target_entity
  const url = structured
    ? getStructuredPushFallbackUrl(targetIntent, targetEntity)
    : getNotificationTargetPath(notification.id, notification.entity_type, notification.target_path)
  return JSON.stringify({
    title: notification.title,
    body: notification.body,
    notification_id: notification.id,
    target_intent: targetIntent,
    ...(targetEntity ? { target_entity: targetEntity } : {}),
    url,
    web_push_endpoint: subscription.endpoint,
    web_push_subscription_id: subscription.id,
  })
}

function getStructuredPushFallbackUrl(targetIntent: string | null, targetEntity: unknown) {
  if (targetIntent === 'notifications_inbox') return '/my/notifications'
  if (
    typeof targetEntity === 'object' &&
    targetEntity !== null &&
    '__entity_type' in targetEntity &&
    targetEntity.__entity_type === 'community' &&
    'slug' in targetEntity &&
    typeof targetEntity.slug === 'string'
  )
    return `/communities/${encodeURIComponent(targetEntity.slug)}`
  return '/'
}
