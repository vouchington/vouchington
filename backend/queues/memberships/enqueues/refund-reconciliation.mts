import { createBackgroundEnqueue } from '@queues/background/enqueues'
import {
  MEMBERSHIPS_REFUND_DISPATCH_JOB,
  MEMBERSHIPS_REFUND_OPERATION_JOB,
} from '@queues/background/enqueues/memberships-jobs-2'
import type { ReconcileMembershipRefundOperationData } from '@queues/background/enqueues/memberships-domain'
import { toSchedulerTemplateOptions } from '@modules/scheduled-job-manifest'
import onError from '@modules/on-error'
import type { EnqueueReturnType } from '@voucha/types'
import type { JobOptions } from 'glide-mq'
import { MEMBERSHIP_REFUND_RECONCILIATION_INTERVAL_MS } from '../config.mts'

const INTERVAL_MS = 300_000

const enqueueDispatchJob = createBackgroundEnqueue(MEMBERSHIPS_REFUND_DISPATCH_JOB)
const enqueueReconciliationJob = createBackgroundEnqueue(MEMBERSHIPS_REFUND_OPERATION_JOB)

export function enqueueDispatchMembershipRefundReconciliation(
  options: { deduplicationId?: string } = {},
): EnqueueReturnType {
  const bucket = Math.floor(Date.now() / INTERVAL_MS)
  const deduplicationId = options.deduplicationId ?? 'membership-refund-reconciliation-dispatch'
  return enqueueDispatchJob({}, {
    jobId: `${deduplicationId}__${bucket}`,
    deduplication: {
      id: deduplicationId,
      mode: 'throttle',
      ttl: INTERVAL_MS,
    },
  } satisfies Partial<JobOptions>)
}

export const refundReconciliationSchedule = {
  schedulerId: 'dispatchMembershipRefundReconciliation',
  repeat: { every: MEMBERSHIP_REFUND_RECONCILIATION_INTERVAL_MS },
  template: {
    name: MEMBERSHIPS_REFUND_DISPATCH_JOB.name,
    data: {},
    opts: toSchedulerTemplateOptions({ ...MEMBERSHIPS_REFUND_DISPATCH_JOB.options }),
  },
  operatorSurfaces: [
    {
      kind: 'scheduled-jobs',
      id: 'dispatchMembershipRefundReconciliation',
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
    .then(() => undefined, onError)
}

export function enqueueReconcileMembershipRefundOperation(
  data: ReconcileMembershipRefundOperationData,
): EnqueueReturnType {
  const jobId = `membership-refund-reconciliation__${data.operationId}__${data.leaseToken}`
  return enqueueReconciliationJob(data, {
    jobId,
    deduplication: { id: jobId, mode: 'simple' },
  } satisfies Partial<JobOptions>)
}

/** An event may wake only a durable lease; scheduler recovery remains authoritative. */
export function enqueueReconcileMembershipRefundOperationBestEffort(
  data: ReconcileMembershipRefundOperationData,
): Promise<void> {
  return Promise.resolve()
    .then(() => enqueueReconcileMembershipRefundOperation(data))
    .then(() => undefined, onError)
}
