import { enqueueBulkReactivatingFinished } from '@data-stores/valkey-glide-mq/enqueue-or-reactivate'
import { createBackgroundBulkEnqueue, createBackgroundEnqueue } from '@queues/background/enqueues'
import type { ProcessStripeEventData } from '@queues/background/enqueues/memberships-domain'
import {
  MEMBERSHIPS_RECOVER_STRIPE_EVENTS_JOB,
  MEMBERSHIPS_STRIPE_EVENT_JOB,
} from '@queues/background/enqueues/memberships-jobs'
import { background } from '@queues/background/queues'
import type { EnqueueReturnType } from '@voucha/types'
import type { JobOptions } from 'glide-mq'
import { membershipOrdering } from './ordering.mts'

const STRIPE_RECOVERY_INTERVAL_MS = 300_000

const enqueueProcessStripeEventJob = createBackgroundEnqueue(MEMBERSHIPS_STRIPE_EVENT_JOB)

export const enqueueBulkProcessStripeEvents = createBackgroundBulkEnqueue(
  MEMBERSHIPS_STRIPE_EVENT_JOB,
  (data: ProcessStripeEventData) => ({ data, opts: stripeEventJobOptions(data) }),
)

/**
 * Recovery re-adds an unleased event under the same lease token while its job may still be queued,
 * so a live job stays the canonical delivery. A retained failed or completed record under that
 * token would otherwise block the id on every pass, so recovery releases it first.
 */
export function enqueueOrReactivateBulkProcessStripeEvents(events: ProcessStripeEventData[]) {
  return enqueueBulkReactivatingFinished({
    queue: background,
    inputs: events,
    jobIdOf: stripeEventJobId,
    enqueueBulk: enqueueBulkProcessStripeEvents,
  })
}

const enqueueRecoverStripeEventsJob = createBackgroundEnqueue(MEMBERSHIPS_RECOVER_STRIPE_EVENTS_JOB)

export function enqueueProcessStripeEvent(data: ProcessStripeEventData): EnqueueReturnType {
  return enqueueProcessStripeEventJob(data, stripeEventJobOptions(data))
}

export function enqueueRecoverStripeEvents(): EnqueueReturnType {
  const jobId = `stripe-event-recovery__${Math.floor(Date.now() / STRIPE_RECOVERY_INTERVAL_MS)}`
  return enqueueRecoverStripeEventsJob({}, {
    jobId,
    deduplication: {
      id: 'stripe-event-recovery',
      mode: 'throttle',
      ttl: STRIPE_RECOVERY_INTERVAL_MS,
    },
  } satisfies Partial<JobOptions>)
}

function stripeEventJobId(data: ProcessStripeEventData): string {
  return `stripe-event__${data.stripeEventRecordId}__${data.leaseToken}`
}

function stripeEventJobOptions(data: ProcessStripeEventData): Partial<JobOptions> {
  const jobId = stripeEventJobId(data)
  return {
    jobId,
    deduplication: { id: jobId, mode: 'simple' },
    ...(data.stripeSubscriptionId
      ? {
          ordering: membershipOrdering(
            `stripe-subscription:${data.isLiveMode ? 'production' : 'test'}:${data.stripeSubscriptionId}`,
          ),
        }
      : {}),
  }
}
