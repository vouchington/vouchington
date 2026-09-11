import type { Job } from 'glide-mq'
import type { UserDeletionJobs } from '@queues/user-deletions/types'
import { processUserDeletion, recoverUserDeletions } from '../processors.mts'

type UserDeletionJobProcessors = {
  processUserDeletion: typeof processUserDeletion
  recoverUserDeletions: typeof recoverUserDeletions
}

const PROCESSORS: UserDeletionJobProcessors = { processUserDeletion, recoverUserDeletions }

export async function processUserDeletionJob(job: Job, processors = PROCESSORS): Promise<void> {
  const name = job.name as UserDeletionJobs
  if (name === 'processUserDeletion') {
    const { requestId, processingAttemptId } = job.data
    if (!requestId || !processingAttemptId) return
    await processors.processUserDeletion(requestId, processingAttemptId, {
      isFinalAttempt: isFinalUserDeletionAttempt(job),
    })
    return
  }
  if (name === 'recoverUserDeletions') {
    await processors.recoverUserDeletions()
    return
  }
  throw new Error(`Unknown job name: ${job.name}`)
}

export function isFinalUserDeletionAttempt(job: Pick<Job, 'attemptsMade' | 'opts'>): boolean {
  return job.attemptsMade + 1 >= (job.opts.attempts ?? 1)
}
