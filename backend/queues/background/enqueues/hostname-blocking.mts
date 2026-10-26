import { enqueueBulkReactivatingFinished } from '@data-stores/valkey-glide-mq/enqueue-or-reactivate'
import type { EnqueueReturnType } from '@voucha/types'
import { background } from '../queues.mts'
import { createBackgroundBulkEnqueue, createBackgroundEnqueue } from '../enqueues.mts'
import {
  HOSTNAME_BLOCKING_ORDERING,
  HOSTNAME_BLOCKING_PROCESS_JOB,
  HOSTNAME_BLOCKING_RECOVERY_JOB,
  type HostnameBlockCleanupData,
  type HostnameBlockRecoveryData,
} from './hostname-blocking-jobs.mts'

const enqueueCleanupJobs = createBackgroundBulkEnqueue(
  HOSTNAME_BLOCKING_PROCESS_JOB,
  (data: HostnameBlockCleanupData) => ({
    data,
    opts: {
      jobId: hostnameBlockCleanupJobId(data),
      ordering: HOSTNAME_BLOCKING_ORDERING.task,
    },
  }),
)

const enqueueRecoveryJob = createBackgroundEnqueue(HOSTNAME_BLOCKING_RECOVERY_JOB)
const enqueueRecoveryContinuationJobs = createBackgroundBulkEnqueue(
  HOSTNAME_BLOCKING_RECOVERY_JOB,
  (data: HostnameBlockRecoveryData) => ({
    data,
    opts: {
      jobId: hostnameBlockRecoveryJobId(data),
      ordering: HOSTNAME_BLOCKING_ORDERING.dispatcher,
    },
  }),
)

export function enqueueOrReactivateHostnameBlockCleanups(
  operations: HostnameBlockCleanupData[],
): EnqueueReturnType {
  return enqueueBulkReactivatingFinished({
    queue: background,
    inputs: operations,
    jobIdOf: hostnameBlockCleanupJobId,
    enqueueBulk: enqueueCleanupJobs,
  })
}

export function enqueueHostnameBlockRecovery(
  data: HostnameBlockRecoveryData = {},
): EnqueueReturnType {
  if (data.afterBlockId) {
    return enqueueBulkReactivatingFinished({
      queue: background,
      inputs: [data],
      jobIdOf: hostnameBlockRecoveryJobId,
      enqueueBulk: enqueueRecoveryContinuationJobs,
    }).then(jobs => jobs[0] ?? null)
  }
  return enqueueRecoveryJob(data, {
    ordering: HOSTNAME_BLOCKING_ORDERING.dispatcher,
  })
}

function hostnameBlockCleanupJobId(data: HostnameBlockCleanupData): string {
  return `hostnameBlock__${data.blockId}__${data.progress}`
}

function hostnameBlockRecoveryJobId(data: HostnameBlockRecoveryData): string {
  return `hostnameBlockingRecovery__${data.afterBlockId}`
}
