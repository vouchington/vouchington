import type { Job } from 'glide-mq'
import {
  ACCOUNT_LIFECYCLE_CLEANUP_EXPORTS_JOB,
  ACCOUNT_LIFECYCLE_EXPORT_REQUEST_JOB,
  ACCOUNT_LIFECYCLE_RECOVER_EXPORTS_JOB,
} from '@queues/background/enqueues/account-lifecycle-jobs'
import {
  processCleanupExpiredExports,
  processExportRequest,
  recoverExportRequests,
} from './account-data-requests.mts'

type AccountDataRequestJobProcessors = {
  processCleanupExpiredExports: typeof processCleanupExpiredExports
  processExportRequest: typeof processExportRequest
  recoverExportRequests: typeof recoverExportRequests
}

const PROCESSORS: AccountDataRequestJobProcessors = {
  processCleanupExpiredExports,
  processExportRequest,
  recoverExportRequests,
}

export async function processAccountDataRequestJob(
  job: Job,
  processors = PROCESSORS,
): Promise<void> {
  if (job.name === ACCOUNT_LIFECYCLE_EXPORT_REQUEST_JOB.name) {
    if (!job.data.processingAttemptId) return
    const isFinalAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? 1)
    await processors.processExportRequest(
      job.data.requestId,
      job.data.userId,
      undefined,
      job.data.processingAttemptId,
      isFinalAttempt,
    )
    return
  }
  if (job.name === ACCOUNT_LIFECYCLE_CLEANUP_EXPORTS_JOB.name) {
    await processors.processCleanupExpiredExports()
    return
  }
  if (job.name === ACCOUNT_LIFECYCLE_RECOVER_EXPORTS_JOB.name) {
    await processors.recoverExportRequests()
    return
  }
  throw new Error(`Unknown job name: ${job.name}`)
}
