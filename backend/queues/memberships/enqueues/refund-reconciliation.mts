import { createEnqueueFunction } from '@data-stores/valkey-glide-mq'
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

const DISPATCH_JOB_NAME: MembershipsJobs = 'dispatchMembershipRefundReconciliation'
const RECONCILIATION_JOB_NAME: MembershipsJobs = 'reconcileMembershipRefundOperation'
const INTERVAL_MS = 300_000

const enqueueDispatchJob = createEnqueueFunction<Record<string, never>, MembershipsJobs>({
  queue: memberships,
  queueName: QUEUE_NAME,
  jobName: DISPATCH_JOB_NAME,
})
const enqueueReconciliationJob = createEnqueueFunction<
  ReconcileMembershipRefundOperationData,
  MembershipsJobs
>({
  queue: memberships,
  queueName: QUEUE_NAME,
  jobName: RECONCILIATION_JOB_NAME,
  defaults: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000, jitter: 0.5 },
    removeOnComplete: 100,
    removeOnFail: 100,
  },
})

export function enqueueDispatchMembershipRefundReconciliation(): EnqueueReturnType {
  const bucket = Math.floor(Date.now() / INTERVAL_MS)
  return enqueueDispatchJob({}, {
    jobId: `membership-refund-reconciliation-dispatch__${bucket}`,
    priority: PRIORITY_DISPATCHER,
    deduplication: {
      id: 'membership-refund-reconciliation-dispatch',
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
export function enqueueDispatchMembershipRefundReconciliationBestEffort(): void {
  void Promise.resolve().then(enqueueDispatchMembershipRefundReconciliation).catch(onError)
}

export function enqueueReconcileMembershipRefundOperation(
  data: ReconcileMembershipRefundOperationData,
): EnqueueReturnType {
  const jobId = `membership-refund-reconciliation__${data.operationId}__${data.leaseToken}`
  return enqueueReconciliationJob(data, {
    jobId,
    priority: PRIORITY_DEFAULT,
    deduplication: { id: jobId, mode: 'simple' },
  } satisfies Partial<JobOptions>)
}

/** An event may wake only a durable lease; scheduler recovery remains authoritative. */
export function enqueueReconcileMembershipRefundOperationBestEffort(
  data: ReconcileMembershipRefundOperationData,
): void {
  void Promise.resolve()
    .then(() => enqueueReconcileMembershipRefundOperation(data))
    .catch(onError)
}
