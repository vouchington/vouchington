import { createBulkEnqueueFunction, createEnqueueFunction } from '@data-stores/valkey-glide-mq'
import type { EnqueueReturnType } from '@voucha/types'
import type { JobOptions } from 'glide-mq'
import {
  ACTIVITYPUB_INBOX_DEFAULTS,
  CLEANUP_INTERVAL_MS,
  CLEANUP_PRIORITY,
  PROCESS_PRIORITY,
  QUEUE_NAME,
  RECOVERY_INTERVAL_MS,
  RECOVERY_PRIORITY,
} from './config.mts'
import { activitypubInbox } from './queues.mts'
import type { ActivityPubInboxDeliveryJob, ActivityPubInboxJobs } from './types.mts'

const enqueueDeliveryJob = createEnqueueFunction<ActivityPubInboxDeliveryJob, ActivityPubInboxJobs>(
  {
    queue: activitypubInbox,
    queueName: QUEUE_NAME,
    jobName: 'processDelivery',
    defaults: ACTIVITYPUB_INBOX_DEFAULTS,
  },
)

export const enqueueBulkActivityPubInboxDeliveries = createBulkEnqueueFunction<
  ActivityPubInboxDeliveryJob,
  ActivityPubInboxDeliveryJob,
  ActivityPubInboxJobs
>({
  queue: activitypubInbox,
  queueName: QUEUE_NAME,
  jobName: 'processDelivery',
  defaults: ACTIVITYPUB_INBOX_DEFAULTS,
  buildJob: data => ({ data, opts: deliveryJobOptions(data, RECOVERY_PRIORITY) }),
})

const enqueueRecoveryJob = createEnqueueFunction<Record<string, never>, ActivityPubInboxJobs>({
  queue: activitypubInbox,
  queueName: QUEUE_NAME,
  jobName: 'recoverDeliveries',
  defaults: ACTIVITYPUB_INBOX_DEFAULTS,
})

const enqueueFailedBackfillJob = createEnqueueFunction<Record<string, never>, ActivityPubInboxJobs>(
  {
    queue: activitypubInbox,
    queueName: QUEUE_NAME,
    jobName: 'rearmFailedDeliveries',
    defaults: ACTIVITYPUB_INBOX_DEFAULTS,
  },
)

const enqueueCleanupJob = createEnqueueFunction<Record<string, never>, ActivityPubInboxJobs>({
  queue: activitypubInbox,
  queueName: QUEUE_NAME,
  jobName: 'cleanupExpiredDeliveries',
  defaults: ACTIVITYPUB_INBOX_DEFAULTS,
})

export function enqueueActivityPubInboxDelivery(
  data: ActivityPubInboxDeliveryJob,
): EnqueueReturnType {
  return enqueueDeliveryJob(data, deliveryJobOptions(data))
}

export function enqueueDelayedActivityPubInboxDelivery(
  data: ActivityPubInboxDeliveryJob,
  delayMs: number,
): EnqueueReturnType {
  return enqueueDeliveryJob(data, { ...deliveryJobOptions(data), delay: delayMs })
}

export function enqueueRecoverActivityPubInboxDeliveries(): EnqueueReturnType {
  const jobId = `activitypub-inbox-recovery__${Math.floor(Date.now() / RECOVERY_INTERVAL_MS)}`
  return enqueueRecoveryJob({}, {
    jobId,
    priority: RECOVERY_PRIORITY,
    deduplication: {
      id: 'activitypub-inbox-recovery',
      mode: 'throttle',
      ttl: RECOVERY_INTERVAL_MS,
    },
  } satisfies Partial<JobOptions>)
}

export function enqueueRearmFailedActivityPubInboxDeliveries(): EnqueueReturnType {
  return enqueueFailedBackfillJob({}, {
    priority: RECOVERY_PRIORITY,
    deduplication: {
      id: 'activitypub-inbox-failed-backfill',
      mode: 'throttle',
      ttl: RECOVERY_INTERVAL_MS,
    },
  } satisfies Partial<JobOptions>)
}

export function enqueueCleanupExpiredActivityPubInboxDeliveries(): EnqueueReturnType {
  const jobId = `activitypub-inbox-cleanup__${Math.floor(Date.now() / CLEANUP_INTERVAL_MS)}`
  return enqueueCleanupJob({}, {
    jobId,
    priority: CLEANUP_PRIORITY,
    deduplication: {
      id: 'activitypub-inbox-cleanup',
      mode: 'throttle',
      ttl: CLEANUP_INTERVAL_MS,
    },
  } satisfies Partial<JobOptions>)
}

function deliveryJobOptions(
  data: ActivityPubInboxDeliveryJob,
  priority = PROCESS_PRIORITY,
): Partial<JobOptions> {
  const jobId = `activitypub-inbox__${data.deliveryId}__${data.processingAttemptId}`
  return {
    jobId,
    priority,
    deduplication: { id: jobId, mode: 'simple' },
  }
}
