import { enqueueBulkReactivatingFinished } from '@data-stores/valkey-glide-mq/enqueue-or-reactivate'
import { createBackgroundBulkEnqueue, createBackgroundEnqueue } from '@queues/background/enqueues'
import {
  ACCOUNT_LIFECYCLE_RECOVER_DELETIONS_JOB,
  ACCOUNT_LIFECYCLE_USER_DELETION_JOB,
  type AccountLifecycleUserDeletionData as UserDeletionJobData,
} from '@queues/background/enqueues/account-lifecycle-jobs'
import type { EnqueueReturnType } from '@voucha/types'
import { USER_DELETIONS_RECOVERY_INTERVAL_MS } from '../config.mts'
import { accountLifecycle } from '../queues.mts'
import type { UserDeletionEnqueueData } from './types-user-deletions.mts'

const enqueueProcessUserDeletionJob = createBackgroundEnqueue(ACCOUNT_LIFECYCLE_USER_DELETION_JOB)

export const enqueueBulkUserDeletions = createBackgroundBulkEnqueue(
  ACCOUNT_LIFECYCLE_USER_DELETION_JOB,
  (data: UserDeletionJobData) => {
    const jobId = userDeletionJobId(data)
    return { data, opts: { jobId, deduplication: { id: jobId, mode: 'simple' as const } } }
  },
)

/**
 * Recovery re-adds an attempt under the same token while its job may still be queued, so a live
 * job stays the canonical delivery. A retained failed or completed record under that token would
 * otherwise block the id on every pass, so recovery releases it first.
 */
export function enqueueOrReactivateBulkUserDeletions(attempts: UserDeletionJobData[]) {
  return enqueueBulkReactivatingFinished({
    queue: accountLifecycle,
    inputs: attempts,
    jobIdOf: userDeletionJobId,
    enqueueBulk: enqueueBulkUserDeletions,
  })
}

const enqueueRecoverUserDeletionsJob = createBackgroundEnqueue(
  ACCOUNT_LIFECYCLE_RECOVER_DELETIONS_JOB,
)

export async function enqueueUserDeletion(data: UserDeletionEnqueueData): Promise<void> {
  const { delayMs, ...jobData } = data
  const jobId = userDeletionJobId(jobData)
  await enqueueProcessUserDeletionJob(jobData, {
    jobId,
    ...(delayMs ? { delay: delayMs } : {}),
    deduplication: { id: jobId, mode: 'simple' },
  })
}

export function enqueueRecoverUserDeletions(): EnqueueReturnType {
  const window = Math.floor(Date.now() / USER_DELETIONS_RECOVERY_INTERVAL_MS)
  return enqueueRecoverUserDeletionsJob(
    {},
    {
      jobId: `user-deletion-recovery__${window}`,
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
