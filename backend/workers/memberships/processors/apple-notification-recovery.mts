import { enqueueBulkProcessAppleNotifications } from '@queues/memberships/enqueues'
import { findRecoverableAppleNotificationJobs } from '@services/memberships/apple/notification-recovery'
import { getMembershipWorkLimit } from '@services/memberships/work-limits'

/** A full page reports possible work for a later scheduled pass. */
export async function recoverAppleNotifications(
  evidenceIds?: readonly string[],
  batchSize = getMembershipWorkLimit('notification_recovery_batch_size'),
): Promise<{ enqueued: number; hasMore: boolean }> {
  const notifications = await findRecoverableAppleNotificationJobs(evidenceIds, batchSize)
  if (notifications.length === 0) return { enqueued: 0, hasMore: false }
  await enqueueBulkProcessAppleNotifications(notifications)
  return { enqueued: notifications.length, hasMore: notifications.length === batchSize }
}
