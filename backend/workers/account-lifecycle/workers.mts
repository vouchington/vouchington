import { backgroundHandler } from '@queues/background/enqueues/define-handler'
import {
  ACCOUNT_LIFECYCLE_CLEANUP_EXPORTS_JOB,
  ACCOUNT_LIFECYCLE_EXPORT_REQUEST_JOB,
  ACCOUNT_LIFECYCLE_RECOVER_DELETIONS_JOB,
  ACCOUNT_LIFECYCLE_RECOVER_EXPORTS_JOB,
  ACCOUNT_LIFECYCLE_USER_DELETION_JOB,
} from '@queues/background/enqueues/account-lifecycle-jobs'
import { processAccountDataRequestJob } from './processors/account-data-request-job.mts'
import { processUserDeletionJob } from './processors/user-deletion-job.mts'

export const accountLifecycleHandlers = [
  backgroundHandler(ACCOUNT_LIFECYCLE_EXPORT_REQUEST_JOB, job => processAccountDataRequestJob(job)),
  backgroundHandler(ACCOUNT_LIFECYCLE_CLEANUP_EXPORTS_JOB, job =>
    processAccountDataRequestJob(job),
  ),
  backgroundHandler(ACCOUNT_LIFECYCLE_RECOVER_EXPORTS_JOB, job =>
    processAccountDataRequestJob(job),
  ),
  backgroundHandler(ACCOUNT_LIFECYCLE_USER_DELETION_JOB, job => processUserDeletionJob(job)),
  backgroundHandler(ACCOUNT_LIFECYCLE_RECOVER_DELETIONS_JOB, job => processUserDeletionJob(job)),
]
