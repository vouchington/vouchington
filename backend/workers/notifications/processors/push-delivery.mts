import {
  claimNotificationPushIntent,
  deliverClaimedNotificationPushIntent,
} from '@services/notifications-push'
import { NOTIFICATION_PUSH_INTENT_LEASE_SECONDS } from '@services/notifications-push/push-intent-delivery-policy'

type NotificationPushData = { userId: string; notificationId: string }

export async function processDeliverNotificationPushIntent(data: NotificationPushData) {
  const intent = await claimNotificationPushIntent(
    { user_id: data.userId, notification_id: data.notificationId },
    NOTIFICATION_PUSH_INTENT_LEASE_SECONDS,
  )
  if (!intent) return { delivered: 0, suppressed: false }
  return deliverClaimedNotificationPushIntent(intent)
}
