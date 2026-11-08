import type { EnqueueReturnType } from '@voucha/types'
import type { JobOptions } from 'glide-mq'
import { PRIORITY_DISPATCHER, STRIPE_CATALOG_RECONCILIATION_INTERVAL_MS } from '../config.mts'
import { createMembershipEnqueueFunction } from './typed-job.mts'

const enqueueCatalogJob = createMembershipEnqueueFunction('reconcileStripeMembershipCatalog', {
  attempts: 5,
  backoff: { type: 'exponential', delay: 5000, jitter: 0.5 },
  removeOnComplete: 100,
  removeOnFail: 100,
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
