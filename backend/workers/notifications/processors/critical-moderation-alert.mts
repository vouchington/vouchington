import { processPagedDispatcher } from '@data-stores/valkey-glide-mq/paged-dispatcher'
import type { Job } from 'glide-mq'
import { background } from '@queues/background/queues'
import { backgroundHandler } from '@queues/background/enqueues/define-handler'
import { NOTIFICATIONS_CRITICAL_MODERATION_ALERT_JOB } from '@queues/background/enqueues/critical-moderation-alert-job'
import { enqueueContinueCriticalModerationAlertNotification } from '@queues/notifications/enqueues'
import { processCriticalModerationAlertNotification } from '../processors.mts'

/** The optional recipient scope is an owned-ID test seam and never enters the queue payload. */
export function createCriticalModerationAlertNotificationHandler(
  recipientUserIds?: readonly string[],
) {
  return (job: Job<{ reportId: string; afterUserId: string }>) =>
    processPagedDispatcher(job, {
      dispatcher: 'notifications',
      cursorKey: 'userId',
      target: background,
      targetName: 'background',
      readAndDispatch: async pageSize => {
        const result = await processCriticalModerationAlertNotification(
          { ...job.data, pageSize },
          recipientUserIds,
        )
        return {
          result,
          ...(result.nextAfterUserId
            ? { next: { reportId: job.data.reportId, afterUserId: result.nextAfterUserId } }
            : {}),
        }
      },
      enqueueNext: enqueueContinueCriticalModerationAlertNotification,
    })
}

export const criticalModerationAlertHandlers = [
  backgroundHandler(
    NOTIFICATIONS_CRITICAL_MODERATION_ALERT_JOB,
    createCriticalModerationAlertNotificationHandler(),
  ),
]
