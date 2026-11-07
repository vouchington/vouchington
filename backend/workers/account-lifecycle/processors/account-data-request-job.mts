import type { Job } from 'glide-mq'
import {
  ACCOUNT_LIFECYCLE_CLEANUP_EXPORTS_JOB,
  ACCOUNT_LIFECYCLE_EXPORT_REQUEST_JOB,
  ACCOUNT_LIFECYCLE_RECOVER_EXPORTS_JOB,
  type AccountLifecycleJobPayloads,
} from '@queues/background/enqueues/account-lifecycle-jobs'
import {
  processCleanupExpiredExports,
  processExportRequest,
  recoverExportRequests,
} from './account-data-requests.mts'

type NamedAccountLifecycleJob = {
  [TName in keyof AccountLifecycleJobPayloads]: Job<AccountLifecycleJobPayloads[TName]> & {
    readonly name: TName
  }
}[keyof AccountLifecycleJobPayloads]

type AccountDataRequestJob = Extract<
  NamedAccountLifecycleJob,
  {
    name:
      | typeof ACCOUNT_LIFECYCLE_EXPORT_REQUEST_JOB.name
      | typeof ACCOUNT_LIFECYCLE_CLEANUP_EXPORTS_JOB.name
      | typeof ACCOUNT_LIFECYCLE_RECOVER_EXPORTS_JOB.name
  }
>

export async function processAccountDataRequestJob(job: AccountDataRequestJob): Promise<void> {
  const jobName: string = job.name
  if (job.name === ACCOUNT_LIFECYCLE_EXPORT_REQUEST_JOB.name) {
    if (!job.data.processingAttemptId) return
    const isFinalAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? 1)
    await processExportRequest(
      job.data.requestId,
      job.data.userId,
      job.data.processingAttemptId,
      isFinalAttempt,
    )
    return
  }
  if (job.name === ACCOUNT_LIFECYCLE_CLEANUP_EXPORTS_JOB.name) {
    await processCleanupExpiredExports()
    return
  }
  if (job.name === ACCOUNT_LIFECYCLE_RECOVER_EXPORTS_JOB.name) {
    await recoverExportRequests()
    return
  }
  throw new Error(`Unknown job name: ${jobName}`)
}
