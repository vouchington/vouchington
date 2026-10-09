import { createBulkEnqueueFunction, createEnqueueFunction } from '@data-stores/valkey-glide-mq'
import type { EnqueueReturnType } from '@voucha/types'
import type { JobOptions } from 'glide-mq'
import {
  MICROSOFT_STORE_SOURCE_RECOVERY_INTERVAL_MS,
  PRIORITY_DEFAULT,
  PRIORITY_DISPATCHER,
  QUEUE_NAME,
} from '../config.mts'
import { memberships } from '../queues.mts'
import type { MembershipsJobs, ReconcileMicrosoftStoreSourceData } from '../types.mts'

const defaults = {
  attempts: 10,
  backoff: { type: 'exponential' as const, delay: 5000, jitter: 0.5 },
  removeOnComplete: true,
  removeOnFail: true,
}
const recoveryOrdering = { key: 'microsoft-store-recovery', concurrency: 1 }

const enqueueRecovery = createEnqueueFunction<Record<string, never>, MembershipsJobs>({
  queue: memberships,
  queueName: QUEUE_NAME,
  jobName: 'recoverMicrosoftStoreSources',
  defaults,
})

const enqueueBulkSource = createBulkEnqueueFunction<
  ReconcileMicrosoftStoreSourceData & { bucket: number },
  ReconcileMicrosoftStoreSourceData,
  MembershipsJobs
>({
  queue: memberships,
  queueName: QUEUE_NAME,
  jobName: 'reconcileMicrosoftStoreSource',
  defaults,
  buildJob: ({ bucket, ...data }) => ({ data, opts: sourceJobOptions(data, bucket) }),
})

function currentSourceBucket(): number {
  return Math.floor(Date.now() / MICROSOFT_STORE_SOURCE_RECOVERY_INTERVAL_MS)
}

function sourceJobOptions(
  data: ReconcileMicrosoftStoreSourceData,
  bucket: number,
): Partial<JobOptions> {
  return {
    jobId: `microsoft-store-source__${data.sourceId}__${bucket}`,
    priority: PRIORITY_DEFAULT,
    deduplication: { id: `microsoft-store-source__${data.sourceId}__${bucket}`, mode: 'simple' },
    ordering: { key: `microsoft-store-source:${data.sourceId}`, concurrency: 1 },
  }
}

/** One batched add of source reconciliation jobs sharing one recovery bucket. */
export function enqueueBulkReconcileMicrosoftStoreSources(
  sources: ReconcileMicrosoftStoreSourceData[],
): EnqueueReturnType {
  const bucket = currentSourceBucket()
  return enqueueBulkSource(sources.map(source => ({ ...source, bucket })))
}

export function enqueueRecoverMicrosoftStoreSources(): EnqueueReturnType {
  const bucket = currentSourceBucket()
  return enqueueRecovery({}, {
    jobId: `microsoft-store-recovery__${bucket}`,
    priority: PRIORITY_DISPATCHER,
    deduplication: {
      id: 'microsoft-store-recovery',
      mode: 'throttle',
      ttl: MICROSOFT_STORE_SOURCE_RECOVERY_INTERVAL_MS,
    },
    ordering: recoveryOrdering,
  } satisfies Partial<JobOptions>)
}

/** Continues a frozen recovery sweep without waiting for the hourly dispatcher bucket. */
export function enqueueContinueRecoverMicrosoftStoreSources(): EnqueueReturnType {
  return enqueueRecovery({}, {
    priority: PRIORITY_DISPATCHER,
    ordering: recoveryOrdering,
  } satisfies Partial<JobOptions>)
}
