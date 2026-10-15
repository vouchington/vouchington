import { createBackgroundBulkEnqueue, createBackgroundEnqueue } from '@queues/background/enqueues'
import type { ReconcileMicrosoftStoreSourceData } from '@queues/background/enqueues/memberships-domain'
import {
  MEMBERSHIPS_MICROSOFT_STORE_SOURCE_JOB,
  MEMBERSHIPS_RECOVER_MICROSOFT_STORE_SOURCES_JOB,
} from '@queues/background/enqueues/memberships-jobs'
import type { EnqueueReturnType } from '@voucha/types'
import type { JobOptions } from 'glide-mq'
import { MICROSOFT_STORE_SOURCE_RECOVERY_INTERVAL_MS } from '../config.mts'
import { membershipOrdering } from './ordering.mts'

export const microsoftStoreRecoveryOrdering = membershipOrdering('microsoft-store-recovery')

const enqueueRecovery = createBackgroundEnqueue(MEMBERSHIPS_RECOVER_MICROSOFT_STORE_SOURCES_JOB)

const enqueueBulkSource = createBackgroundBulkEnqueue(
  MEMBERSHIPS_MICROSOFT_STORE_SOURCE_JOB,
  ({ bucket, ...data }: ReconcileMicrosoftStoreSourceData & { bucket: number }) => ({
    data,
    opts: sourceJobOptions(data, bucket),
  }),
)

function currentSourceBucket(): number {
  return Math.floor(Date.now() / MICROSOFT_STORE_SOURCE_RECOVERY_INTERVAL_MS)
}

function sourceJobOptions(
  data: ReconcileMicrosoftStoreSourceData,
  bucket: number,
): Partial<JobOptions> {
  return {
    jobId: `microsoft-store-source__${data.sourceId}__${bucket}`,
    deduplication: { id: `microsoft-store-source__${data.sourceId}__${bucket}`, mode: 'simple' },
    ordering: membershipOrdering(`microsoft-store-source:${data.sourceId}`),
  }
}

/** One batched add of source reconciliation jobs sharing one recovery bucket. */
export function enqueueBulkReconcileMicrosoftStoreSources(
  sources: ReconcileMicrosoftStoreSourceData[],
): ReturnType<typeof enqueueBulkSource> {
  const bucket = currentSourceBucket()
  return enqueueBulkSource(sources.map(source => ({ ...source, bucket })))
}

export function enqueueRecoverMicrosoftStoreSources(): EnqueueReturnType {
  const bucket = currentSourceBucket()
  return enqueueRecovery({}, {
    jobId: `microsoft-store-recovery__${bucket}`,
    deduplication: {
      id: 'microsoft-store-recovery',
      mode: 'throttle',
      ttl: MICROSOFT_STORE_SOURCE_RECOVERY_INTERVAL_MS,
    },
    ordering: microsoftStoreRecoveryOrdering,
  } satisfies Partial<JobOptions>)
}

/** Continues a frozen recovery sweep without waiting for the hourly dispatcher bucket. */
export function enqueueContinueRecoverMicrosoftStoreSources(): EnqueueReturnType {
  return enqueueRecovery({}, {
    ordering: microsoftStoreRecoveryOrdering,
  } satisfies Partial<JobOptions>)
}
