import { createBulkEnqueueFunction } from '@data-stores/valkey-glide-mq'
import type { EnqueueReturnType } from '@voucha/types'
import type { JobOptions } from 'glide-mq'
import onError from '@modules/on-error'
import {
  MEMBERSHIP_REFUND_RECONCILIATION_INTERVAL_MS,
  PRIORITY_DEFAULT,
  PRIORITY_DISPATCHER,
  QUEUE_NAME,
} from '../config.mts'
import { memberships } from '../queues.mts'
import type { MembershipsJobs, ReconcileMembershipRefundOperationData } from '../types.mts'

import { createMembershipEnqueueFunction } from './typed-job.mts'

const DISPATCH_JOB_NAME = 'dispatchMembershipRefundReconciliation' satisfies MembershipsJobs
const RECONCILIATION_JOB_NAME = 'reconcileMembershipRefundOperation' satisfies MembershipsJobs
const INTERVAL_MS = 300_000

const enqueueDispatchJob = createMembershipEnqueueFunction(DISPATCH_JOB_NAME)

function buildReconciliationJob(data: ReconcileMembershipRefundOperationData) {
  const jobId = `membership-refund-reconciliation__${data.operationId}__${data.leaseToken}`
  return {
    data,
    opts: {
      jobId,
      priority: PRIORITY_DEFAULT,
      deduplication: { id: jobId, mode: 'simple' },
    } satisfies Partial<JobOptions>,
  }
}

const enqueueBulkReconciliationJobs = createBulkEnqueueFunction({
  queue: memberships,
  queueName: QUEUE_NAME,
  jobName: RECONCILIATION_JOB_NAME,
  defaults: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000, jitter: 0.5 },
    removeOnComplete: 100,
    removeOnFail: 100,
  } satisfies Partial<JobOptions>,
  buildJob: buildReconciliationJob,
})

export function enqueueDispatchMembershipRefundReconciliation(
  options: { deduplicationId?: string } = {},
): EnqueueReturnType {
  const bucket = Math.floor(Date.now() / INTERVAL_MS)
  const deduplicationId = options.deduplicationId ?? 'membership-refund-reconciliation-dispatch'
  return enqueueDispatchJob({}, {
    jobId: `${deduplicationId}__${bucket}`,
    priority: PRIORITY_DISPATCHER,
    deduplication: {
      id: deduplicationId,
      mode: 'throttle',
      ttl: INTERVAL_MS,
    },
  } satisfies Partial<JobOptions>)
}

export const refundReconciliationSchedule = {
  schedulerId: DISPATCH_JOB_NAME,
  repeat: { every: MEMBERSHIP_REFUND_RECONCILIATION_INTERVAL_MS },
  template: {
    name: DISPATCH_JOB_NAME,
    data: {},
    opts: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000, jitter: 0.5 },
      removeOnComplete: 100,
      removeOnFail: 100,
      priority: PRIORITY_DISPATCHER,
    } satisfies JobOptions,
  },
  operatorSurfaces: [
    {
      kind: 'scheduled-jobs',
      id: DISPATCH_JOB_NAME,
      schedule: 'every 5m',
      description: 'Dispatch due membership refund reconciliations',
      trigger: enqueueDispatchMembershipRefundReconciliation,
    },
  ],
} as const

/** Durable reconciliation state is already committed when this wake-up is requested. */
export function enqueueDispatchMembershipRefundReconciliationBestEffort(): Promise<void> {
  return Promise.resolve()
    .then(() => enqueueDispatchMembershipRefundReconciliation())
    .then(() => undefined)
    .catch(onError)
}

/** One call adds every leased operation's reconciliation job. */
export function enqueueBulkReconcileMembershipRefundOperations(
  operations: readonly ReconcileMembershipRefundOperationData[],
) {
  return enqueueBulkReconciliationJobs([...operations])
}

/** An event may wake only durable leases; scheduler recovery remains authoritative. */
export function enqueueBulkReconcileMembershipRefundOperationsBestEffort(
  operations: readonly ReconcileMembershipRefundOperationData[],
): Promise<void> {
  return Promise.resolve()
    .then(() => enqueueBulkReconcileMembershipRefundOperations(operations))
    .then(() => undefined)
    .catch(onError)
}
