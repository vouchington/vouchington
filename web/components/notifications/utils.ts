import type { Notification, NotificationCommunity } from '@/types/api-responses'
import { communityHref } from '@/lib/links/entity-href'

export function base64UrlToUint8Array(value: string) {
  const padding = '='.repeat((4 - (value.length % 4)) % 4)
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = window.atob(base64)
  /* c8 ignore next -- uses window.atob; tested at integration level with real push subscriptions */
  return Uint8Array.from(raw, char => char.codePointAt(0)!)
}

export function getSafeNotificationTarget(targetPath: string): string | null {
  try {
    const url = new URL(targetPath, window.location.origin)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    if (url.origin !== window.location.origin) return null
    return `${url.pathname}${url.search}${url.hash}`
  } catch {
    return null
  }
}

export function resolveNotificationTarget(
  notification: {
    target_entity?: Notification['target_entity']
    target_intent?: Notification['target_intent']
    target_path: string | null
  },
  communities: Record<string, NotificationCommunity> = {},
): string | null {
  if (notification.target_entity?.__entity_type === 'community') {
    const community = communities[notification.target_entity.id]
    if (community) return communityHref(community)
    if (!notification.target_intent && !notification.target_path) return '/my/notifications'
  }
  if (notification.target_intent === 'notifications_inbox') return '/my/notifications'
  return notification.target_path ? getSafeNotificationTarget(notification.target_path) : null
}

export function navigateToTarget(targetPath: string) {
  const safeTarget = getSafeNotificationTarget(targetPath)
  if (!safeTarget) return
  window.location.assign(safeTarget)
}
