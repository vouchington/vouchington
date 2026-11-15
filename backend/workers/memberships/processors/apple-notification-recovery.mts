import { getPagedDispatchLimit } from '@data-stores/valkey-glide-mq/paged-dispatcher-config'
import { memberships } from '@queues/memberships/queues'
import { getMembershipWorkLimit } from '@services/memberships/work-limits'
import { enqueueBulkProcessAppleNotifications } from '@queues/memberships/enqueues'
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
  const counts = await memberships.getJobCounts()
  const depth = (counts.waiting ?? 0) + (counts.active ?? 0) + (counts.delayed ?? 0)
  const remaining = getPagedDispatchLimit('memberships_max_depth') - depth
  if (remaining <= 0)
    return job.moveToDelayed(Date.now() + getPagedDispatchLimit('memberships_backoff_ms'))
  const batchSize = Math.min(
    options.batchSize ?? getMembershipWorkLimit('notification_recovery_batch_size'),
    remaining,
  )
  if (!job.data.through) {
    const through = await findAppleNotificationRecoveryUpperBound(options.evidenceIds)
    if (!through) return { enqueued: 0 }
    await job.updateData({ ...job.data, through })
  }
  const page = await findRecoverableAppleNotificationJobs({ ...job.data, ...options, batchSize })
  if (page.notifications.length > 0) await enqueueBulkProcessAppleNotifications(page.notifications)
  if (page.nextCursor && page.through) {
    await job.updateData({ after: page.nextCursor, through: page.through })
    return job.moveToDelayed(Date.now())
  }
  return { enqueued: page.notifications.length }
}
