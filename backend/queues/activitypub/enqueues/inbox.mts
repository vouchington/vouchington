import { enqueueBulkReactivatingFinished } from '@data-stores/valkey-glide-mq/enqueue-or-reactivate'
import { background } from '@queues/background/queues'
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

const enqueueBulkDeliveryJobs = createBackgroundBulkEnqueue(
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

export async function enqueueActivityPubInboxDelivery(
  data: ActivityPubInboxDeliveryJob,
): EnqueueReturnType {
  const jobs = await enqueueBulkReactivatingFinished({
    queue: background,
    inputs: [data],
    jobIdOf: input => deliveryJobOptions(input).jobId,
    enqueueBulk: async inputs => {
      const job = await enqueueDeliveryJob(inputs[0]!, deliveryJobOptions(inputs[0]!))
      return job ? [job] : []
    },
  })
  return jobs[0] ?? null
}

/** A terminal transport stall may bypass the domain processor's failure checkpoint. */
export async function getActivityPubInboxDeliveryFailure(
  data: ActivityPubInboxDeliveryJob,
): Promise<string | undefined> {
  const job = await background.getJob(deliveryJobOptions(data).jobId!)
  if (
    !job ||
    typeof job.data !== 'object' ||
    job.data === null ||
    !('deliveryId' in job.data) ||
    job.data.deliveryId !== data.deliveryId ||
    (await job.getState()) !== 'failed'
  )
    return undefined
  return job.failedReason ?? 'ActivityPub inbox job failed outside its processor'
}

export function enqueueBulkActivityPubInboxDeliveries(inputs: ActivityPubInboxDeliveryJob[]) {
  return enqueueBulkReactivatingFinished({
    queue: background,
    inputs,
    jobIdOf: data => deliveryJobOptions(data).jobId,
    enqueueBulk: enqueueBulkDeliveryJobs,
  })
}

export function enqueueRecoverActivityPubInboxDeliveriesContinuation(
  afterId: string,
): EnqueueReturnType {
  return enqueueRecoveryJob(
    { afterId },
    {
      jobId: `activitypub-inbox-recovery__${afterId}`,
      removeOnComplete: true,
      removeOnFail: true,
    },
  )
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
  const jobId = `activitypub-inbox__${data.requestDigest}`
  return {
    jobId,
    deduplication: { id: jobId, mode: 'simple' },
  }
}
