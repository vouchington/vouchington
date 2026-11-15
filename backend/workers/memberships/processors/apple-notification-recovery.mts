import {
  enqueueBulkProcessAppleNotifications,
  enqueueRecoverAppleNotifications,
} from '@queues/memberships/enqueues'
import type { RecoverAppleNotificationsData } from '@queues/memberships/types'
import type { Job } from 'glide-mq'
import {
  findRecoverableAppleNotificationJobs,
  findAppleNotificationRecoveryUpperBound,
} from '@services/memberships/apple/notification-recovery'

export async function recoverAppleNotifications(
  job: Job<RecoverAppleNotificationsData>,
  options: { evidenceIds?: readonly string[]; batchSize?: number } = {},
): Promise<{ enqueued: number }> {
  if (!job.data.through) {
    const through = await findAppleNotificationRecoveryUpperBound(options.evidenceIds)
    if (!through) return { enqueued: 0 }
    await job.updateData({ ...job.data, through })
  }
  const page = await findRecoverableAppleNotificationJobs({ ...job.data, ...options })
  if (page.notifications.length > 0) await enqueueBulkProcessAppleNotifications(page.notifications)
  if (page.nextCursor && page.through)
    await enqueueRecoverAppleNotifications({
      after: page.nextCursor,
      through: page.through,
    })
  return { enqueued: page.notifications.length }
}
