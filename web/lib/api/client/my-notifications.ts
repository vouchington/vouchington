'use client'
import { clientApi } from './instance'
import { authRecoveryFetch } from './auth-recovery-fetch'
import type {
  NotificationsUnreadSummaryResponseBody,
  MarkAllNotificationsReadResponseBody,
  WebPushSubscriptionResponseBody,
  WebPushSubscriptionsResponseBody,
} from '@/types/api-responses'

export function getMyUnreadNotificationsSummaryClient(): Promise<NotificationsUnreadSummaryResponseBody> {
  return clientApi.get<NotificationsUnreadSummaryResponseBody>('/api/v1/my/notifications/unread')
}
export function markMyNotificationRead(notificationId: string): Promise<void> {
  return clientApi.patch(`/api/v1/my/notifications/${notificationId}`, { is_read: true })
}
export async function markMyNotificationReadKeepalive(notificationId: string): Promise<void> {
  const response = await authRecoveryFetch(`/api/v1/my/notifications/${notificationId}`, {
    method: 'PATCH',
    body: JSON.stringify({ is_read: true }),
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    keepalive: true,
  })
  if (!response.ok) {
    throw new Error(`Notification read receipt failed (${response.status})`)
  }
}
export function markAllMyNotificationsRead(): Promise<MarkAllNotificationsReadResponseBody> {
  return clientApi.post<MarkAllNotificationsReadResponseBody>(
    '/api/v1/my/notifications/read-all',
    {},
  )
}
export function deleteMyNotification(notificationId: string): Promise<void> {
  return clientApi.delete(`/api/v1/my/notifications/${notificationId}`)
}
interface WebPushSubscriptionInput {
  endpoint: string
  p256dh: string
  auth: string
  expiration_time_ms?: number | null
  user_agent?: string
}
export function createMyWebPushSubscription(
  body: WebPushSubscriptionInput,
): Promise<WebPushSubscriptionResponseBody> {
  return clientApi.post<WebPushSubscriptionResponseBody>(
    '/api/v1/my/notifications/push-subscriptions',
    body,
  )
}
export function getMyWebPushSubscriptionsClient(options?: {
  after?: string
  limit?: number
}): Promise<WebPushSubscriptionsResponseBody> {
  return clientApi.get<WebPushSubscriptionsResponseBody>(
    '/api/v1/my/notifications/push-subscriptions',
    { searchParams: options },
  )
}
export function deleteMyWebPushSubscription(subscriptionId: string): Promise<void> {
  return clientApi.delete(`/api/v1/my/notifications/push-subscriptions/${subscriptionId}`)
}
