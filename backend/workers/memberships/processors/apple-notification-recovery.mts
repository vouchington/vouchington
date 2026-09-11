import { enqueueBulkProcessAppleNotifications } from '@queues/memberships/enqueues'
import { findRecoverableAppleNotificationJobs } from '@services/memberships/apple/notification-recovery'

export type RecoverAppleNotificationsDependencies = {
  findRecoverableAppleNotificationJobs: typeof findRecoverableAppleNotificationJobs
  enqueueBulkProcessAppleNotifications: typeof enqueueBulkProcessAppleNotifications
}

const dependencies: RecoverAppleNotificationsDependencies = {
  findRecoverableAppleNotificationJobs,
  enqueueBulkProcessAppleNotifications,
}

export async function recoverAppleNotifications(
  overrides: RecoverAppleNotificationsDependencies = dependencies,
): Promise<{ enqueued: number }> {
  const notifications = await overrides.findRecoverableAppleNotificationJobs()
  if (notifications.length === 0) return { enqueued: 0 }
  await overrides.enqueueBulkProcessAppleNotifications(notifications)
  return { enqueued: notifications.length }
}
