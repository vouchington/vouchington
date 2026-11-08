import type { Job } from 'glide-mq'
import {
  ACCOUNT_LIFECYCLE_RECOVER_DELETIONS_JOB,
  ACCOUNT_LIFECYCLE_USER_DELETION_JOB,
  type AccountLifecycleJob,
} from '@queues/background/enqueues/account-lifecycle-jobs'
import { processUserDeletion, recoverUserDeletions } from './user-deletions.mts'

type UserDeletionJob = Extract<
  AccountLifecycleJob,
  {
    name:
      | typeof ACCOUNT_LIFECYCLE_USER_DELETION_JOB.name
      | typeof ACCOUNT_LIFECYCLE_RECOVER_DELETIONS_JOB.name
  }
>

export async function processUserDeletionJob(job: UserDeletionJob): Promise<void> {
  const jobName: string = job.name
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
  throw new Error(`Unknown job name: ${jobName}`)
}

function isFinalUserDeletionAttempt(job: Pick<Job<unknown>, 'attemptsMade' | 'opts'>): boolean {
  return job.attemptsMade + 1 >= (job.opts.attempts ?? 1)
}
