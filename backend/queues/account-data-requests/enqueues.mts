import {
  createBulkEnqueueFunction,
  createEnqueueFunction as createGlideMqEnqueueFunction,
} from '@data-stores/valkey-glide-mq'
import { enqueueBulkReactivatingFinished } from '@data-stores/valkey-glide-mq/enqueue-or-reactivate'
import type { EnqueueReturnType } from '@voucha/types'
import type { JobOptions } from 'glide-mq'
import { ACCOUNT_DATA_REQUESTS_QUEUE_NAME, PRIORITY_DEFAULT } from './config.mts'
import { accountDataRequests } from './queues.mts'
import type { AccountDataRequestsJobs, ExportRequestData } from './types.mts'

const JOB_NAME: AccountDataRequestsJobs = 'processExportRequest'
const CLEANUP_JOB_NAME: AccountDataRequestsJobs = 'processCleanupExpiredExports'
const RECOVERY_JOB_NAME: AccountDataRequestsJobs = 'recoverExportRequests'
const RECOVERY_INTERVAL_MS = 300_000

type ExportRequestContext = ExportRequestData & {
  operation: string
}

const enqueueExportRequestJob = createGlideMqEnqueueFunction<
  ExportRequestData,
  AccountDataRequestsJobs,
  ExportRequestContext
>({
  queue: accountDataRequests,
  queueName: ACCOUNT_DATA_REQUESTS_QUEUE_NAME,
  jobName: JOB_NAME,
  defaults: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000, jitter: 0.5 },
    removeOnComplete: 100,
    removeOnFail: 100,
  },
  decorateError: (error, context) => {
    error.extra = context.callContext
    error.tags = { critical: true }
    return error
  },
})

export const enqueueBulkExportRequests = createBulkEnqueueFunction<
  ExportRequestData,
  ExportRequestData,
  AccountDataRequestsJobs
>({
  queue: accountDataRequests,
  queueName: ACCOUNT_DATA_REQUESTS_QUEUE_NAME,
  jobName: JOB_NAME,
  defaults: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000, jitter: 0.5 },
    removeOnComplete: 100,
    removeOnFail: 100,
  },
  buildJob: data => {
    const jobId = exportRequestJobId(data)
    return {
      data,
      opts: {
        jobId,
        priority: PRIORITY_DEFAULT,
        deduplication: { id: jobId, mode: 'simple' as const },
      },
    }
  },
})

/**
 * Recovery re-adds an attempt under the same token while its job may still be queued, so a live
 * job stays the canonical delivery. A retained failed or completed record under that token would
 * otherwise block the id on every pass, so recovery releases it first.
 */
export function enqueueOrReactivateBulkExportRequests(requests: ExportRequestData[]) {
  return enqueueBulkReactivatingFinished({
    queue: accountDataRequests,
    inputs: requests,
    jobIdOf: exportRequestJobId,
    enqueueBulk: enqueueBulkExportRequests,
  })
}

const enqueueCleanupExpiredExportsJob = createGlideMqEnqueueFunction<
  Record<string, never>,
  AccountDataRequestsJobs
>({
  queue: accountDataRequests,
  queueName: ACCOUNT_DATA_REQUESTS_QUEUE_NAME,
  jobName: CLEANUP_JOB_NAME,
  defaults: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000, jitter: 0.5 },
    removeOnComplete: 100,
    removeOnFail: 100,
  },
})

const enqueueRecoverExportRequestsJob = createGlideMqEnqueueFunction<
  Record<string, never>,
  AccountDataRequestsJobs
>({
  queue: accountDataRequests,
  queueName: ACCOUNT_DATA_REQUESTS_QUEUE_NAME,
  jobName: RECOVERY_JOB_NAME,
  defaults: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000, jitter: 0.5 },
    removeOnComplete: 100,
    removeOnFail: 100,
  },
})

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
      priority: priority ?? PRIORITY_DEFAULT,
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
    priority: 100,
    deduplication: {
      id: 'account-data-export-recovery',
      mode: 'throttle',
      ttl: RECOVERY_INTERVAL_MS,
    },
  } satisfies Partial<JobOptions>)
}

export function enqueueCleanupExpiredExports(): EnqueueReturnType {
  return enqueueCleanupExpiredExportsJob({}, { priority: PRIORITY_DEFAULT })
}

function exportRequestJobId(data: Pick<ExportRequestData, 'requestId' | 'processingAttemptId'>) {
  return `account-data-export__${data.requestId}__${data.processingAttemptId}`
}
