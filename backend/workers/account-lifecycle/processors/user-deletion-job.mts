import type { Job } from 'glide-mq'
import {
  ACCOUNT_LIFECYCLE_RECOVER_DELETIONS_JOB,
  ACCOUNT_LIFECYCLE_USER_DELETION_JOB,
} from '@queues/background/enqueues/account-lifecycle-jobs'
import { processUserDeletion, recoverUserDeletions } from './user-deletions.mts'

export async function processUserDeletionJob(job: Job): Promise<void> {
  if (job.name === ACCOUNT_LIFECYCLE_USER_DELETION_JOB.name) {
    const { requestId, processingAttemptId } = job.data
    if (!requestId || !processingAttemptId) return
    await processUserDeletion(requestId, processingAttemptId, {
      isFinalAttempt: isFinalUserDeletionAttempt(job),
    })
    return
  }
  if (job.name === ACCOUNT_LIFECYCLE_RECOVER_DELETIONS_JOB.name) {
    await recoverUserDeletions()
    return
  }
  throw new Error(`Unknown job name: ${job.name}`)
}

function isFinalUserDeletionAttempt(job: Pick<Job, 'attemptsMade' | 'opts'>): boolean {
  return job.attemptsMade + 1 >= (job.opts.attempts ?? 1)
}
