import type { Job } from 'glide-mq'
import { processAccountDataRequestJob } from './processors/account-data-request-job.mts'
import { processUserDeletionJob } from './processors/user-deletion-job.mts'

export async function processAccountLifecycleJob(job: Job): Promise<void> {
  switch (job.name) {
    case 'processExportRequest':
    case 'processCleanupExpiredExports':
    case 'recoverExportRequests':
      await processAccountDataRequestJob(job)
      return
    case 'processUserDeletion':
    case 'recoverUserDeletions':
      await processUserDeletionJob(job)
      return
    default:
      throw new Error(`Unknown job name: ${job.name}`)
  }
}
