import { createEnqueueFunction } from '@data-stores/valkey-glide-mq'
import type { EnqueueReturnType } from '@voucha/types'
import type { JobOptions } from 'glide-mq'
import {
  PRIORITY_DISPATCHER,
  QUEUE_NAME,
  STRIPE_CATALOG_RECONCILIATION_INTERVAL_MS,
} from '../config.mts'
import { memberships } from '../queues.mts'
import type { MembershipsJobs } from '../types.mts'

const enqueueCatalogJob = createEnqueueFunction<Record<string, never>, MembershipsJobs>({
  queue: memberships,
  queueName: QUEUE_NAME,
  jobName: 'reconcileStripeMembershipCatalog',
  defaults: {
    attempts: 5,
    backoff: { type: 'exponential', delay: 5000, jitter: 0.5 },
    removeOnComplete: 100,
    removeOnFail: 100,
  },
})

export function enqueueReconcileStripeMembershipCatalog(): EnqueueReturnType {
  const bucket = Math.floor(Date.now() / STRIPE_CATALOG_RECONCILIATION_INTERVAL_MS)
  return enqueueCatalogJob({}, {
    jobId: `stripe-catalog__${bucket}`,
    priority: PRIORITY_DISPATCHER,
    deduplication: {
      id: 'stripe-catalog',
      mode: 'throttle',
      ttl: STRIPE_CATALOG_RECONCILIATION_INTERVAL_MS,
    },
    ordering: { key: 'stripe-catalog:voucha-web', concurrency: 1 },
  } satisfies Partial<JobOptions>)
}
