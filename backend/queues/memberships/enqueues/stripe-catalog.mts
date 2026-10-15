import { createBackgroundEnqueue } from '@queues/background/enqueues'
import { MEMBERSHIPS_STRIPE_CATALOG_JOB } from '@queues/background/enqueues/memberships-jobs'
import type { EnqueueReturnType } from '@voucha/types'
import type { JobOptions } from 'glide-mq'
import { STRIPE_CATALOG_RECONCILIATION_INTERVAL_MS } from '../config.mts'
import { membershipOrdering } from './ordering.mts'

export const stripeCatalogOrdering = membershipOrdering('stripe-catalog:voucha-web')

const enqueueCatalogJob = createBackgroundEnqueue(MEMBERSHIPS_STRIPE_CATALOG_JOB)

export function enqueueReconcileStripeMembershipCatalog(): EnqueueReturnType {
  const bucket = Math.floor(Date.now() / STRIPE_CATALOG_RECONCILIATION_INTERVAL_MS)
  return enqueueCatalogJob({}, {
    jobId: `stripe-catalog__${bucket}`,
    deduplication: {
      id: 'stripe-catalog',
      mode: 'throttle',
      ttl: STRIPE_CATALOG_RECONCILIATION_INTERVAL_MS,
    },
    ordering: stripeCatalogOrdering,
  } satisfies Partial<JobOptions>)
}
