import { enqueueBulkDeliverNotificationPushIntents } from '@queues/notifications/enqueues'
import onError from '@modules/on-error'

export type ReportResolutionNotification = { user_id: string; id: string }
type EnqueueReportResolutionNotificationPushes = typeof enqueueBulkDeliverNotificationPushIntents

export function enqueueReportResolutionNotificationsBestEffort(
  notifications: ReportResolutionNotification[],
  enqueuePushes: EnqueueReportResolutionNotificationPushes = enqueueBulkDeliverNotificationPushIntents,
) {
  if (notifications.length === 0) return
  try {
    const result = enqueuePushes(
      notifications.map(notification => ({
        userId: notification.user_id,
        notificationId: notification.id,
      })),
    )
    if (result) void result.catch(onError)
  } catch (error) {
    onError(error instanceof Error ? error : new Error(String(error)))
  }
}
