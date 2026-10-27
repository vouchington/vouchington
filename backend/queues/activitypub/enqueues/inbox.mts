import { enqueueBulkReactivatingFinished } from '@data-stores/valkey-glide-mq/enqueue-or-reactivate'
import { createRetryingCommandClient } from '@data-stores/valkey-glide-mq/glide-mq-command-client'
import { acquireTerminalJobRemoval } from '@data-stores/valkey-glide-mq/terminal-job-removal'
import { workerQueuePrefix } from '@data-stores/valkey-glide-mq'
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
  return enqueueDeliveryJob(data, deliveryJobOptions(data))
}

/** A terminal transport stall may bypass the domain processor's failure checkpoint. */
export async function getActivityPubInboxDeliveryJobStatus(
  data: ActivityPubInboxDeliveryJob,
  queue: Pick<typeof background, 'getJob'> = background,
): Promise<
  | { state: 'missing' | 'live' | 'completed' | 'stale-terminal' }
  | { state: 'failed'; reason: string }
> {
  const job = await queue.getJob(deliveryJobOptions(data).jobId!)
  if (!job) return { state: 'missing' }
  const state = await job.getState()
  if (
    typeof job.data !== 'object' ||
    job.data === null ||
    !('deliveryId' in job.data) ||
    job.data.deliveryId !== data.deliveryId
  ) {
    // A previous envelope with this exact digest may have completed and been deleted.
    // Its retained terminal record must not block a newly inserted replay envelope.
    if (state === 'failed' || state === 'completed') return { state: 'stale-terminal' }
    if (state === 'unknown') return { state: 'missing' }
    return { state: 'live' }
  }
  if (state === 'failed') {
    return {
      state: 'failed',
      reason: job.failedReason ?? 'ActivityPub inbox job failed outside its processor',
    }
  }
  if (state === 'completed') return { state: 'completed' }
  if (state === 'unknown') return { state: 'missing' }
  return { state: 'live' }
}

/** Release a failed delivery id only after its durable failure checkpoint commits. */
export async function removeFailedActivityPubInboxDelivery(
  data: ActivityPubInboxDeliveryJob,
  queue: Pick<typeof background, 'name'> = background,
  prefix = workerQueuePrefix ?? 'glide',
): Promise<boolean> {
  const jobId = deliveryJobOptions(data).jobId!
  const dedicated = createRetryingCommandClient('activitypub-inbox-failed-removal')
  try {
    const claim = await acquireTerminalJobRemoval(
      dedicated.client,
      `${prefix}:{${queue.name}}`,
      jobId,
    )
    if (claim.state !== 'terminal') {
      await claim.release()
      return false
    }
    try {
      const raw = await claim.readData()
      const retained = raw === null ? null : (JSON.parse(raw.toString()) as unknown)
      if (
        claim.terminalState !== 'failed' ||
        typeof retained !== 'object' ||
        retained === null ||
        !('deliveryId' in retained) ||
        retained.deliveryId !== data.deliveryId
      ) {
        return false
      }
      return await claim.remove()
    } finally {
      await claim.release()
    }
  } finally {
    await dedicated.close()
  }
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
