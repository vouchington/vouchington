import { enqueueBulkProcessAppleNotifications } from '@queues/memberships/enqueues'
import { findRecoverableAppleNotificationJobs } from '@services/memberships/apple/notification-recovery'

export async function recoverAppleNotifications(
  evidenceIds?: readonly string[],
  batchSize?: number,
): Promise<{ enqueued: number }> {
  const notifications = await findRecoverableAppleNotificationJobs(evidenceIds, batchSize)
  if (notifications.length === 0) return { enqueued: 0 }
  await enqueueBulkProcessAppleNotifications(notifications)
  return { enqueued: notifications.length }
}
