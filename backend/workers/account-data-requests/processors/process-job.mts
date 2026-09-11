import type { Job } from 'glide-mq'
import type { AccountDataRequestsJobs } from '@queues/account-data-requests/types'
import {
  processCleanupExpiredExports,
  processExportRequest,
  recoverExportRequests,
} from '../processors.mts'

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
  const name = job.name as AccountDataRequestsJobs
  if (name === 'processExportRequest') {
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
  if (name === 'processCleanupExpiredExports') {
    await processors.processCleanupExpiredExports()
    return
  }
  if (name === 'recoverExportRequests') {
    await processors.recoverExportRequests()
    return
  }
  throw new Error(`Unknown job name: ${job.name}`)
}
