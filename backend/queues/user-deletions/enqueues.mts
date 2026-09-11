import {
  createBulkEnqueueFunction,
  createEnqueueFunction as createGlideMqEnqueueFunction,
} from '@data-stores/valkey-glide-mq'
import type { EnqueueReturnType } from '@voucha/types'
import type { JobOptions } from 'glide-mq'
import {
  USER_DELETIONS_PRIORITY_DEFAULT,
  USER_DELETIONS_QUEUE_NAME,
  USER_DELETIONS_RECOVERY_INTERVAL_MS,
} from './config.mts'
import { userDeletions } from './queues.mts'
import type { UserDeletionEnqueueData, UserDeletionJobData, UserDeletionJobs } from './types.mts'

const PROCESS_JOB_NAME: UserDeletionJobs = 'processUserDeletion'
const RECOVERY_JOB_NAME: UserDeletionJobs = 'recoverUserDeletions'

const PROCESS_JOB_DEFAULTS = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 5000, jitter: 0.5 },
  removeOnComplete: 100,
  removeOnFail: 100,
} satisfies Partial<JobOptions>

const enqueueProcessUserDeletionJob = createGlideMqEnqueueFunction<
  UserDeletionJobData,
  UserDeletionJobs
>({
  queue: userDeletions,
  queueName: USER_DELETIONS_QUEUE_NAME,
  jobName: PROCESS_JOB_NAME,
  defaults: PROCESS_JOB_DEFAULTS,
})

export const enqueueBulkUserDeletions = createBulkEnqueueFunction<
  UserDeletionJobData,
  UserDeletionJobData,
  UserDeletionJobs
>({
  queue: userDeletions,
  queueName: USER_DELETIONS_QUEUE_NAME,
  jobName: PROCESS_JOB_NAME,
  defaults: PROCESS_JOB_DEFAULTS,
  buildJob: data => {
    const jobId = userDeletionJobId(data)
    return {
      data,
      opts: {
        jobId,
        priority: USER_DELETIONS_PRIORITY_DEFAULT,
        deduplication: { id: jobId, mode: 'simple' as const },
      },
    }
  },
})

const enqueueRecoverUserDeletionsJob = createGlideMqEnqueueFunction<
  Record<string, never>,
  UserDeletionJobs
>({
  queue: userDeletions,
  queueName: USER_DELETIONS_QUEUE_NAME,
  jobName: RECOVERY_JOB_NAME,
  defaults: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000, jitter: 0.5 },
    removeOnComplete: 100,
    removeOnFail: 100,
  },
})

export async function enqueueUserDeletion(data: UserDeletionEnqueueData): Promise<void> {
  const { delayMs, ...jobData } = data
  const jobId = userDeletionJobId(jobData)
  await enqueueProcessUserDeletionJob(jobData, {
    jobId,
    ...(delayMs ? { delay: delayMs } : {}),
    priority: USER_DELETIONS_PRIORITY_DEFAULT,
    deduplication: { id: jobId, mode: 'simple' },
  })
}

export function enqueueRecoverUserDeletions(): EnqueueReturnType {
  const window = Math.floor(Date.now() / USER_DELETIONS_RECOVERY_INTERVAL_MS)
  return enqueueRecoverUserDeletionsJob(
    {},
    {
      jobId: `user-deletion-recovery__${window}`,
      priority: 100,
      deduplication: {
        id: 'user-deletion-recovery',
        mode: 'throttle',
        ttl: USER_DELETIONS_RECOVERY_INTERVAL_MS,
      },
    },
  )
}

export function userDeletionJobId(data: UserDeletionJobData): string {
  return `user-deletion__${data.requestId}__${data.processingAttemptId}`
}
