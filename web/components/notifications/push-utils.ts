import type { NotificationPushSubscription } from './notifications-page'
import type { WebPushBinding } from '@/lib/push-service-worker'

export function getPushManager(registration: ServiceWorkerRegistration) {
  return (registration as ServiceWorkerRegistration & { pushManager: PushManager }).pushManager
}

export function getCurrentSubscription(
  subscriptions: NotificationPushSubscription[],
  currentBinding: WebPushBinding | null | undefined,
) {
  return (
    subscriptions.find(
      item =>
        item.endpoint === currentBinding?.endpoint && item.id === currentBinding.subscription_id,
    ) ?? null
  )
}
