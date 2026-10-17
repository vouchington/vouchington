import { enqueueBulkReactivatingFinished } from '@data-stores/valkey-glide-mq/enqueue-or-reactivate'
import { createBackgroundBulkEnqueue, createBackgroundEnqueue } from '@queues/background/enqueues'
import {
  ACCOUNT_LIFECYCLE_CLEANUP_EXPORTS_JOB,
  ACCOUNT_LIFECYCLE_EXPORT_REQUEST_JOB,
  ACCOUNT_LIFECYCLE_RECOVER_EXPORTS_JOB,
  type AccountLifecycleExportRequestData as ExportRequestData,
} from '@queues/background/enqueues/account-lifecycle-jobs'
import type { EnqueueReturnType } from '@voucha/types'
import type { JobOptions } from 'glide-mq'
import { accountLifecycle } from '../queues.mts'

const RECOVERY_INTERVAL_MS = 300_000

const enqueueExportRequestJob = createBackgroundEnqueue(ACCOUNT_LIFECYCLE_EXPORT_REQUEST_JOB, {
  decorateError: (error, context) => {
    error.extra = context.callContext as Record<string, unknown>
    error.tags = { critical: true }
    return error
  },
})

export const enqueueBulkExportRequests = createBackgroundBulkEnqueue(
  ACCOUNT_LIFECYCLE_EXPORT_REQUEST_JOB,
  (data: ExportRequestData) => {
    const jobId = exportRequestJobId(data)
    return { data, opts: { jobId, deduplication: { id: jobId, mode: 'simple' as const } } }
  },
)

/**
 * Recovery re-adds an attempt under the same token while its job may still be queued, so a live
 * job stays the canonical delivery. A retained failed or completed record under that token would
 * otherwise block the id on every pass, so recovery releases it first.
 */
export function enqueueOrReactivateBulkExportRequests(requests: ExportRequestData[]) {
  return enqueueBulkReactivatingFinished({
    queue: accountLifecycle,
    inputs: requests,
    jobIdOf: exportRequestJobId,
    enqueueBulk: enqueueBulkExportRequests,
  })
}

const enqueueCleanupExpiredExportsJob = createBackgroundEnqueue(
  ACCOUNT_LIFECYCLE_CLEANUP_EXPORTS_JOB,
)
const enqueueRecoverExportRequestsJob = createBackgroundEnqueue(
  ACCOUNT_LIFECYCLE_RECOVER_EXPORTS_JOB,
)

export async function enqueueExportRequest(
  requestId: string,
  userId: string,
  processingAttemptId: string,
  priority?: number,
): Promise<void> {
  const jobId = exportRequestJobId({ requestId, processingAttemptId })
  await enqueueExportRequestJob(
    { requestId, userId, processingAttemptId },
    {
      jobId,
      ...(priority === undefined ? {} : { priority }),
      deduplication: {
        id: jobId,
        mode: 'simple',
      },
    } satisfies Partial<JobOptions>,
    { requestId, userId, processingAttemptId, operation: 'enqueueExportRequest' },
  )
}

export function enqueueRecoverExportRequests(): EnqueueReturnType {
  const jobId = `account-data-export-recovery__${Math.floor(Date.now() / RECOVERY_INTERVAL_MS)}`
  return enqueueRecoverExportRequestsJob({}, {
    jobId,
    deduplication: {
      id: 'account-data-export-recovery',
      mode: 'throttle',
      ttl: RECOVERY_INTERVAL_MS,
    },
  } satisfies Partial<JobOptions>)
}

export function enqueueCleanupExpiredExports(): EnqueueReturnType {
  return enqueueCleanupExpiredExportsJob({})
}

function exportRequestJobId(data: Pick<ExportRequestData, 'requestId' | 'processingAttemptId'>) {
  return `account-data-export__${data.requestId}__${data.processingAttemptId}`
}
