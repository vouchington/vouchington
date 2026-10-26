import { enqueueBulkReactivatingFinished } from '@data-stores/valkey-glide-mq/enqueue-or-reactivate'
import { createBackgroundBulkEnqueue } from '@queues/background/enqueues'
import { NOTIFICATIONS_MARK_ALL_READ_JOB } from '@queues/background/enqueues/notifications-jobs'
import type { MarkAllNotificationsReadData } from '@queues/background/enqueues/notifications-domain'
import { notifications } from '../queues.mts'

const enqueueBulkMarkAllRead = createBackgroundBulkEnqueue(
  NOTIFICATIONS_MARK_ALL_READ_JOB,
  (data: MarkAllNotificationsReadData) => ({
    data,
    opts: { jobId: markAllReadJobId(data) },
  }),
)

export function enqueueMarkAllNotificationsReadContinuation(data: MarkAllNotificationsReadData) {
  return enqueueBulkReactivatingFinished({
    queue: notifications,
    inputs: [data],
    jobIdOf: markAllReadJobId,
    enqueueBulk: enqueueBulkMarkAllRead,
  })
}

function markAllReadJobId(data: MarkAllNotificationsReadData): string {
  return `notifications-mark-all-read__${data.userId}__${data.throughId}__${data.lastPageId}`
}
