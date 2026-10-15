import { createBackgroundBulkEnqueue, createBackgroundEnqueue } from '@queues/background/enqueues'
import type { ProcessAppleNotificationData } from '@queues/background/enqueues/memberships-domain'
import {
  MEMBERSHIPS_APPLE_NOTIFICATION_JOB,
  MEMBERSHIPS_RECOVER_APPLE_NOTIFICATIONS_JOB,
} from '@queues/background/enqueues/memberships-jobs'
import type { EnqueueReturnType } from '@voucha/types'
import type { JobOptions } from 'glide-mq'
import { APPLE_NOTIFICATION_RECOVERY_INTERVAL_MS } from '../config.mts'
import { membershipOrdering } from './ordering.mts'

const enqueueAppleNotificationJob = createBackgroundEnqueue(MEMBERSHIPS_APPLE_NOTIFICATION_JOB)

export const enqueueBulkProcessAppleNotifications = createBackgroundBulkEnqueue(
  MEMBERSHIPS_APPLE_NOTIFICATION_JOB,
  (data: ProcessAppleNotificationData) => ({ data, opts: appleNotificationJobOptions(data) }),
)

const enqueueRecoverAppleNotificationsJob = createBackgroundEnqueue(
  MEMBERSHIPS_RECOVER_APPLE_NOTIFICATIONS_JOB,
)

export function enqueueProcessAppleNotification(
  data: ProcessAppleNotificationData,
): EnqueueReturnType {
  return enqueueAppleNotificationJob(data, appleNotificationJobOptions(data))
}

export function enqueueRecoverAppleNotifications(): EnqueueReturnType {
  const timeBucket = Math.floor(Date.now() / APPLE_NOTIFICATION_RECOVERY_INTERVAL_MS)
  return enqueueRecoverAppleNotificationsJob({}, {
    jobId: `apple-notification-recovery__${timeBucket}`,
    deduplication: {
      id: 'apple-notification-recovery',
      mode: 'throttle',
      ttl: APPLE_NOTIFICATION_RECOVERY_INTERVAL_MS,
    },
  } satisfies Partial<JobOptions>)
}

function appleNotificationJobOptions(data: ProcessAppleNotificationData): Partial<JobOptions> {
  const jobId = `apple-notification__${data.evidenceId}`
  return {
    jobId,
    deduplication: { id: jobId, mode: 'simple' },
    ordering: membershipOrdering(`apple-lineage:${data.environment}:${data.providerLineageId}`),
  } satisfies Partial<JobOptions>
}
