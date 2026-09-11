export const NOTIFICATION_PUSH_INTENT_LEASE_SECONDS = 120
export const NOTIFICATION_PUSH_INTENT_RENEWAL_MS = 30_000
export const NOTIFICATION_PUSH_ENDPOINT_CONCURRENCY = 5
export const NOTIFICATION_PUSH_SOCKET_TIMEOUT_MS = 30_000

export type NotificationPushDeliveryPolicy = {
  leaseSeconds: number
  renewalMs: number
  endpointConcurrency: number
  socketTimeoutMs: number
}

export const notificationPushDeliveryPolicy: NotificationPushDeliveryPolicy = {
  leaseSeconds: NOTIFICATION_PUSH_INTENT_LEASE_SECONDS,
  renewalMs: NOTIFICATION_PUSH_INTENT_RENEWAL_MS,
  endpointConcurrency: NOTIFICATION_PUSH_ENDPOINT_CONCURRENCY,
  socketTimeoutMs: NOTIFICATION_PUSH_SOCKET_TIMEOUT_MS,
}
