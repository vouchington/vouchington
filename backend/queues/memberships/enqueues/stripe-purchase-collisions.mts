import { createBulkEnqueueFunction, createEnqueueFunction } from '@data-stores/valkey-glide-mq'
import { pagedDispatchJobOptions } from '@data-stores/valkey-glide-mq/paged-dispatcher'
import onError from '@modules/on-error'
import type { JobOptions } from 'glide-mq'
import {
  STRIPE_PURCHASE_COLLISION_RECOVERY_INTERVAL_MS,
  stripePurchaseCollisionOrdering,
} from './stripe-purchase-collision-config.mts'
import { PRIORITY_DEFAULT, PRIORITY_DISPATCHER, QUEUE_NAME } from '../config.mts'
import { memberships } from '../queues.mts'
import type { MembershipsJobs, RecoverStripePurchaseCollisionsData } from '../types.mts'

const JOB: MembershipsJobs = 'processStripePurchaseCollisionWork'
const RECOVERY: MembershipsJobs = 'recoverStripePurchaseCollisions'
const interval = STRIPE_PURCHASE_COLLISION_RECOVERY_INTERVAL_MS

export const enqueueBulkProcessStripePurchaseCollisions = createBulkEnqueueFunction({
  queue: memberships,
  queueName: QUEUE_NAME,
  jobName: JOB,
  defaults: {
    attempts: 5,
    backoff: { type: 'exponential', delay: 5000, jitter: 0.5 },
    removeOnComplete: true,
    removeOnFail: true,
  },
  buildJob: (data: { workId: string }) => ({
    data,
    opts: {
      jobId: `stripe-purchase-collision__${data.workId}`,
      deduplication: { id: `stripe-purchase-collision__${data.workId}`, mode: 'simple' as const },
      priority: PRIORITY_DEFAULT,
      ordering: stripePurchaseCollisionOrdering(),
    },
  }),
})

/** Admission is a fast path; the committed work row survives any queue failure. */
export async function enqueueProcessStripePurchaseCollisionBestEffort(data: {
  workId: string
}): Promise<void> {
  try {
    await enqueueBulkProcessStripePurchaseCollisions([data])
  } catch (err) {
    onError(err instanceof Error ? err : new Error(String(err)))
  }
}

const enqueueRecovery = createEnqueueFunction<RecoverStripePurchaseCollisionsData, MembershipsJobs>(
  {
    queue: memberships,
    queueName: QUEUE_NAME,
    jobName: RECOVERY,
    defaults: {
      ...pagedDispatchJobOptions('memberships'),
      removeOnComplete: 100,
      removeOnFail: 100,
    },
  },
)

export function enqueueRecoverStripePurchaseCollisions(
  data: RecoverStripePurchaseCollisionsData = {},
  options: Partial<JobOptions> = {},
) {
  return enqueueRecovery(data, {
    jobId: `stripe-purchase-collision-recovery__${Math.floor(Date.now() / interval)}`,
    deduplication: { id: 'stripe-purchase-collision-recovery', mode: 'throttle', ttl: interval },
    priority: PRIORITY_DISPATCHER,
    ordering: stripePurchaseCollisionOrdering(true),
    ...options,
  })
}

export const stripePurchaseCollisionSchedule = {
  schedulerId: RECOVERY,
  repeat: { every: interval },
  template: {
    name: RECOVERY,
    data: {},
    opts: {
      ...pagedDispatchJobOptions('memberships'),
      priority: PRIORITY_DISPATCHER,
      ordering: stripePurchaseCollisionOrdering(true),
      removeOnComplete: 100,
      removeOnFail: 100,
    } satisfies JobOptions,
  },
  operatorSurfaces: [
    {
      kind: 'scheduled-jobs',
      id: RECOVERY,
      schedule: 'every 1m',
      description: 'Recover pending Stripe purchase collision work',
      trigger: enqueueRecoverStripePurchaseCollisions,
    },
  ],
} as const
