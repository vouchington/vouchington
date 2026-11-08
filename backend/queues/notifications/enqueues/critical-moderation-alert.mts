import { enqueueBulkReactivatingFinished } from '@data-stores/valkey-glide-mq/enqueue-or-reactivate'
import { getBackgroundOrderingConcurrency, PRIORITY_DISPATCH } from '@queues/background/config'
import { createBackgroundBulkEnqueue } from '@queues/background/enqueues'
import { NOTIFICATIONS_CRITICAL_MODERATION_ALERT_JOB } from '@queues/background/enqueues/critical-moderation-alert-job'
import type { CriticalModerationAlertNotificationData } from '@queues/background/enqueues/notifications-domain'
import { background } from '@queues/background/queues'
import type { JobOptions } from 'glide-mq'
import { continuationOptions } from './reconcile-recipients-options.mts'

const CONTINUATION = { priority: PRIORITY_DISPATCH, removeOnComplete: true, removeOnFail: true }

function criticalModerationAlertJobId(data: CriticalModerationAlertNotificationData): string {
  return `notifications__critical-moderation-alert__${data.reportId}__${data.afterUserId}`
}

const enqueueCriticalModerationAlertJobs = createBackgroundBulkEnqueue(
  NOTIFICATIONS_CRITICAL_MODERATION_ALERT_JOB,
  (data: CriticalModerationAlertNotificationData) => ({
    data,
    opts: {
      jobId: criticalModerationAlertJobId(data),
      ordering: {
        key: `notifications:bulk:critical-moderation-alert:${data.reportId}`,
        concurrency: getBackgroundOrderingConcurrency('notifications:bulk'),
      },
      ...CONTINUATION,
    },
  }),
)

/** Replays of a cursor reuse its job; every following page gets its own user-id cursor identity. */
export function enqueueContinueCriticalModerationAlertNotification(
  data: CriticalModerationAlertNotificationData,
  options?: Partial<JobOptions>,
) {
  return enqueueBulkReactivatingFinished({
    queue: background,
    inputs: [data],
    jobIdOf: criticalModerationAlertJobId,
    enqueueBulk: inputs => enqueueCriticalModerationAlertJobs(inputs, continuationOptions(options)),
  })
}
