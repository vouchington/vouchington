import { createBulkEnqueueFunction } from '@data-stores/valkey-glide-mq'
import { enqueueBulkReactivatingFinished } from '@data-stores/valkey-glide-mq/enqueue-or-reactivate'
import type { EnqueueReturnType } from '@voucha/types'
import type { JobOptions } from 'glide-mq'
import { PRIORITY_DEFAULT, PRIORITY_DISPATCHER, QUEUE_NAME } from '../config.mts'
import { memberships } from '../queues.mts'
import type { MembershipsJobPayloads, MembershipsJobs, ProcessStripeEventData } from '../types.mts'
import { createMembershipEnqueueFunction } from './typed-job.mts'

const STRIPE_EVENT_JOB_NAME = 'processStripeEvent' satisfies MembershipsJobs
const STRIPE_RECOVERY_JOB_NAME = 'recoverStripeEvents' satisfies MembershipsJobs
const STRIPE_RECOVERY_INTERVAL_MS = 300_000

const enqueueProcessStripeEventJob = createMembershipEnqueueFunction(STRIPE_EVENT_JOB_NAME)

const enqueueBulkProcessStripeEvents = createBulkEnqueueFunction({
  queue: memberships,
  queueName: QUEUE_NAME,
  jobName: STRIPE_EVENT_JOB_NAME,
  defaults: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000, jitter: 0.5 },
    removeOnComplete: 100,
    removeOnFail: 100,
  },
  buildJob: (data: ProcessStripeEventData) => {
    const jobId = stripeEventJobId(data)
    return {
      data: data satisfies MembershipsJobPayloads[typeof STRIPE_EVENT_JOB_NAME],
      opts: {
        jobId,
        priority: PRIORITY_DEFAULT,
        deduplication: { id: jobId, mode: 'simple' as const },
        ...getStripeEventOrdering(data),
      },
    }
  },
})

/**
 * Recovery re-adds an unleased event under the same lease token while its job may still be queued,
 * so a live job stays the canonical delivery. A retained failed or completed record under that
 * token would otherwise block the id on every pass, so recovery releases it first.
 */
export function enqueueOrReactivateBulkProcessStripeEvents(events: ProcessStripeEventData[]) {
  return enqueueBulkReactivatingFinished({
    queue: memberships,
    inputs: events,
    jobIdOf: stripeEventJobId,
    enqueueBulk: enqueueBulkProcessStripeEvents,
  })
}

const enqueueRecoverStripeEventsJob = createMembershipEnqueueFunction(STRIPE_RECOVERY_JOB_NAME, {
  attempts: 3,
  backoff: { type: 'exponential', delay: 5000, jitter: 0.5 },
  removeOnComplete: 100,
  removeOnFail: 100,
})

export function enqueueProcessStripeEvent(data: ProcessStripeEventData): EnqueueReturnType {
  const jobId = stripeEventJobId(data)
  return enqueueProcessStripeEventJob(data, {
    jobId,
    priority: PRIORITY_DEFAULT,
    deduplication: { id: jobId, mode: 'simple' },
    ...getStripeEventOrdering(data),
  } satisfies Partial<JobOptions>)
}

export function enqueueRecoverStripeEvents(): EnqueueReturnType {
  const jobId = `stripe-event-recovery__${Math.floor(Date.now() / STRIPE_RECOVERY_INTERVAL_MS)}`
  return enqueueRecoverStripeEventsJob({}, {
    jobId,
    priority: PRIORITY_DISPATCHER,
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

function getStripeEventOrdering(data: ProcessStripeEventData): Partial<JobOptions> {
  if (!data.stripeSubscriptionId) return {}
  return {
    ordering: {
      key: `stripe-subscription:${data.isLiveMode ? 'production' : 'test'}:${data.stripeSubscriptionId}`,
      concurrency: 1,
    },
  }
}
