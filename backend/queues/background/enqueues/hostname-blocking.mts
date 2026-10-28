import {
  createBulkEnqueueFunction,
  createEnqueueFunction,
  type PriorityQueue,
} from '@data-stores/valkey-glide-mq'
import { enqueueBulkReactivatingFinished } from '@data-stores/valkey-glide-mq/enqueue-or-reactivate'
import type { EnqueueReturnType } from '@voucha/types'
import { background } from '../queues.mts'
import {
  HOSTNAME_BLOCKING_ORDERING,
  HOSTNAME_BLOCKING_PROCESS_JOB,
  HOSTNAME_BLOCKING_RECOVERY_JOB,
  type HostnameBlockCleanupData,
  type HostnameBlockRecoveryData,
} from './hostname-blocking-jobs.mts'

export function createHostnameBlockingEnqueues(queue: PriorityQueue<unknown>) {
  const enqueueCleanupJobs = createBulkEnqueueFunction({
    queue,
    queueName: queue.name,
    jobName: HOSTNAME_BLOCKING_PROCESS_JOB.name,
    defaults: HOSTNAME_BLOCKING_PROCESS_JOB.options,
    sensitive: true,
    buildJob: (data: HostnameBlockCleanupData) => ({
      data,
      opts: {
        jobId: hostnameBlockCleanupJobId(data),
        ordering: HOSTNAME_BLOCKING_ORDERING.task,
      },
    }),
  })
  const enqueueRecoveryJob = createEnqueueFunction<HostnameBlockRecoveryData, string>({
    queue,
    queueName: queue.name,
    jobName: HOSTNAME_BLOCKING_RECOVERY_JOB.name,
    defaults: HOSTNAME_BLOCKING_RECOVERY_JOB.options,
  })
  const enqueueRecoveryContinuationJobs = createBulkEnqueueFunction({
    queue,
    queueName: queue.name,
    jobName: HOSTNAME_BLOCKING_RECOVERY_JOB.name,
    defaults: HOSTNAME_BLOCKING_RECOVERY_JOB.options,
    buildJob: (data: HostnameBlockRecoveryData) => ({
      data,
      opts: {
        jobId: hostnameBlockRecoveryJobId(data),
        ordering: HOSTNAME_BLOCKING_ORDERING.dispatcher,
      },
    }),
  })

  const enqueueCleanups = (operations: HostnameBlockCleanupData[]): EnqueueReturnType =>
    enqueueBulkReactivatingFinished({
      queue,
      inputs: operations,
      jobIdOf: hostnameBlockCleanupJobId,
      enqueueBulk: enqueueCleanupJobs,
    })

  const enqueueRecovery = (data: HostnameBlockRecoveryData = {}): EnqueueReturnType => {
    if (data.afterBlockId) {
      return enqueueBulkReactivatingFinished({
        queue,
        inputs: [data],
        jobIdOf: hostnameBlockRecoveryJobId,
        enqueueBulk: enqueueRecoveryContinuationJobs,
      }).then(jobs => jobs[0] ?? null)
    }
    return enqueueRecoveryJob(data, {
      ordering: HOSTNAME_BLOCKING_ORDERING.dispatcher,
    })
  }

  return { enqueueCleanups, enqueueRecovery }
}

const hostnameBlockingEnqueues = createHostnameBlockingEnqueues(background)

export function enqueueOrReactivateHostnameBlockCleanups(
  operations: HostnameBlockCleanupData[],
): EnqueueReturnType {
  return hostnameBlockingEnqueues.enqueueCleanups(operations)
}

export function enqueueHostnameBlockRecovery(
  data: HostnameBlockRecoveryData = {},
): EnqueueReturnType {
  return hostnameBlockingEnqueues.enqueueRecovery(data)
}

function hostnameBlockCleanupJobId(data: HostnameBlockCleanupData): string {
  return `hostnameBlock__${data.blockId}__${data.progress}`
}

function hostnameBlockRecoveryJobId(data: HostnameBlockRecoveryData): string {
  return `hostnameBlockingRecovery__${data.afterBlockId}`
}
