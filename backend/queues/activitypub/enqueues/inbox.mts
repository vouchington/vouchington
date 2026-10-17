import { PRIORITY_DISPATCH } from '@queues/background/config'
import { createBackgroundBulkEnqueue, createBackgroundEnqueue } from '@queues/background/enqueues'
import {
  ACTIVITYPUB_CLEANUP_EXPIRED_DELIVERIES_JOB,
  ACTIVITYPUB_PROCESS_DELIVERY_JOB,
  ACTIVITYPUB_REARM_FAILED_DELIVERIES_JOB,
  ACTIVITYPUB_RECOVER_DELIVERIES_JOB,
} from '@queues/background/enqueues/activitypub-jobs'
import type { EnqueueReturnType } from '@voucha/types'
import type { JobOptions } from 'glide-mq'
import { CLEANUP_INTERVAL_MS, RECOVERY_INTERVAL_MS } from '../config.mts'
import type { ActivityPubInboxDeliveryJob } from '../types.mts'

const enqueueDeliveryJob = createBackgroundEnqueue(ACTIVITYPUB_PROCESS_DELIVERY_JOB)

export const enqueueBulkActivityPubInboxDeliveries = createBackgroundBulkEnqueue(
  ACTIVITYPUB_PROCESS_DELIVERY_JOB,
  // The bulk path re-enqueues recovered work, which ranks behind fresh deliveries.
  (data: ActivityPubInboxDeliveryJob) => ({
    data,
    opts: { ...deliveryJobOptions(data), priority: PRIORITY_DISPATCH },
  }),
)

const enqueueRecoveryJob = createBackgroundEnqueue(ACTIVITYPUB_RECOVER_DELIVERIES_JOB)
const enqueueFailedBackfillJob = createBackgroundEnqueue(ACTIVITYPUB_REARM_FAILED_DELIVERIES_JOB)
const enqueueCleanupJob = createBackgroundEnqueue(ACTIVITYPUB_CLEANUP_EXPIRED_DELIVERIES_JOB)

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
    deduplication: {
      id: 'activitypub-inbox-recovery',
      mode: 'throttle',
      ttl: RECOVERY_INTERVAL_MS,
    },
  } satisfies Partial<JobOptions>)
}

export function enqueueRearmFailedActivityPubInboxDeliveries(): EnqueueReturnType {
  return enqueueFailedBackfillJob({}, {
    deduplication: {
      id: 'activitypub-inbox-failed-backfill',
      mode: 'throttle',
      ttl: RECOVERY_INTERVAL_MS,
    },
  } satisfies Partial<JobOptions>)
}

// A continuation carries the last delivery id of the page before it. Its job id is that cursor, so a
// retried dispatcher cannot enqueue a second continuation, and a finished record releases the id.
export function enqueueRearmFailedActivityPubInboxDeliveriesContinuation(
  afterId: string,
): EnqueueReturnType {
  return enqueueFailedBackfillJob({ afterId }, {
    jobId: `activitypub-inbox-failed-backfill__${afterId}`,
    removeOnComplete: true,
    removeOnFail: true,
  } satisfies Partial<JobOptions>)
}

export function enqueueCleanupExpiredActivityPubInboxDeliveries(): EnqueueReturnType {
  const jobId = `activitypub-inbox-cleanup__${Math.floor(Date.now() / CLEANUP_INTERVAL_MS)}`
  return enqueueCleanupJob({}, {
    jobId,
    deduplication: {
      id: 'activitypub-inbox-cleanup',
      mode: 'throttle',
      ttl: CLEANUP_INTERVAL_MS,
    },
  } satisfies Partial<JobOptions>)
}

function deliveryJobOptions(data: ActivityPubInboxDeliveryJob): Partial<JobOptions> {
  const jobId = `activitypub-inbox__${data.deliveryId}__${data.leaseToken}`
  return {
    jobId,
    deduplication: { id: jobId, mode: 'simple' },
  }
}
