import { createBulkEnqueueFunction, createEnqueueFunction } from '@data-stores/valkey-glide-mq'
import type { EnqueueReturnType } from '@voucha/types'
import type { JobOptions } from 'glide-mq'
import {
  APPLE_NOTIFICATION_RECOVERY_INTERVAL_MS,
  PRIORITY_DEFAULT,
  PRIORITY_DISPATCHER,
  QUEUE_NAME,
} from '../config.mts'
import { memberships } from '../queues.mts'
import type { MembershipsJobs, ProcessAppleNotificationData } from '../types.mts'

const JOB_NAME: MembershipsJobs = 'processAppleNotification'
const RECOVERY_JOB_NAME: MembershipsJobs = 'recoverAppleNotifications'

const appleNotificationDefaults = {
  attempts: 10,
  backoff: { type: 'exponential' as const, delay: 5000, jitter: 0.5 },
  removeOnComplete: true,
  removeOnFail: true,
}

const enqueueAppleNotificationJob = createEnqueueFunction<
  ProcessAppleNotificationData,
  MembershipsJobs
>({
  queue: memberships,
  queueName: QUEUE_NAME,
  jobName: JOB_NAME,
  defaults: appleNotificationDefaults,
})

export const enqueueBulkProcessAppleNotifications = createBulkEnqueueFunction<
  ProcessAppleNotificationData,
  ProcessAppleNotificationData,
  MembershipsJobs
>({
  queue: memberships,
  queueName: QUEUE_NAME,
  jobName: JOB_NAME,
  defaults: appleNotificationDefaults,
  buildJob: data => ({ data, opts: appleNotificationJobOptions(data) }),
})

const enqueueRecoverAppleNotificationsJob = createEnqueueFunction<
  Record<string, never>,
  MembershipsJobs
>({
  queue: memberships,
  queueName: QUEUE_NAME,
  jobName: RECOVERY_JOB_NAME,
  defaults: appleNotificationDefaults,
})

export function enqueueProcessAppleNotification(
  data: ProcessAppleNotificationData,
): EnqueueReturnType {
  return enqueueAppleNotificationJob(data, appleNotificationJobOptions(data))
}

export function enqueueRecoverAppleNotifications(): EnqueueReturnType {
  const timeBucket = Math.floor(Date.now() / APPLE_NOTIFICATION_RECOVERY_INTERVAL_MS)
  return enqueueRecoverAppleNotificationsJob({}, {
    jobId: `apple-notification-recovery__${timeBucket}`,
    priority: PRIORITY_DISPATCHER,
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
    priority: PRIORITY_DEFAULT,
    deduplication: { id: jobId, mode: 'simple' },
    ordering: {
      key: `apple-lineage:${data.environment}:${data.providerLineageId}`,
      concurrency: 1,
    },
  } satisfies Partial<JobOptions>
}
