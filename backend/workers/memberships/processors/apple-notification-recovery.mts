import { enqueueBulkProcessAppleNotifications } from '@queues/memberships/enqueues'
import { findRecoverableAppleNotificationJobs } from '@services/memberships/apple/notification-recovery'

export async function recoverAppleNotifications(
  findJobs: typeof findRecoverableAppleNotificationJobs = findRecoverableAppleNotificationJobs,
): Promise<{ enqueued: number }> {
  const notifications = await findJobs()
  if (notifications.length === 0) return { enqueued: 0 }
  await enqueueBulkProcessAppleNotifications(notifications)
  return { enqueued: notifications.length }
}
