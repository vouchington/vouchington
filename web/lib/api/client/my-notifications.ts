'use client'
import { clientApi } from './instance'
import { clientFetch } from './raw-fetch'
import type {
  NotificationsUnreadSummaryResponseBody,
  WebPushSubscriptionResponseBody,
  WebPushSubscriptionsResponseBody,
} from '@/types/api-responses'

export function getMyUnreadNotificationsSummaryClient(): Promise<NotificationsUnreadSummaryResponseBody> {
  return clientApi.get<NotificationsUnreadSummaryResponseBody>('/api/v1/my/notifications/unread')
}
export function markMyNotificationRead(notificationId: string): Promise<void> {
  return clientApi.patch(`/api/v1/my/notifications/${notificationId}`, { is_read: true })
}
export function markMyNotificationReadKeepalive(notificationId: string): Promise<Response> {
  return clientFetch(`/api/v1/my/notifications/${notificationId}`, {
    method: 'PATCH',
    body: JSON.stringify({ is_read: true }),
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    keepalive: true,
  })
}
export function markAllMyNotificationsRead(): Promise<void> {
  return clientApi.post('/api/v1/my/notifications/read-all', {})
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
