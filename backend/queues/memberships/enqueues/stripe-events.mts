import { createBulkEnqueueFunction, createEnqueueFunction } from '@data-stores/valkey-glide-mq'
import type { EnqueueReturnType } from '@voucha/types'
import type { JobOptions } from 'glide-mq'
import { PRIORITY_DEFAULT, PRIORITY_DISPATCHER, QUEUE_NAME } from '../config.mts'
import { memberships } from '../queues.mts'
import type { MembershipsJobs, ProcessStripeEventData } from '../types.mts'

const STRIPE_EVENT_JOB_NAME: MembershipsJobs = 'processStripeEvent'
const STRIPE_RECOVERY_JOB_NAME: MembershipsJobs = 'recoverStripeEvents'
const STRIPE_RECOVERY_INTERVAL_MS = 300_000

const enqueueProcessStripeEventJob = createEnqueueFunction<ProcessStripeEventData, MembershipsJobs>(
  { queue: memberships, queueName: QUEUE_NAME, jobName: STRIPE_EVENT_JOB_NAME },
)

export const enqueueBulkProcessStripeEvents = createBulkEnqueueFunction<
  ProcessStripeEventData,
  ProcessStripeEventData,
  MembershipsJobs
>({
  queue: memberships,
  queueName: QUEUE_NAME,
  jobName: STRIPE_EVENT_JOB_NAME,
  defaults: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000, jitter: 0.5 },
    removeOnComplete: 100,
    removeOnFail: 100,
  },
  buildJob: data => {
    const jobId = stripeEventJobId(data)
    return {
      data,
      opts: {
        jobId,
        priority: PRIORITY_DEFAULT,
        deduplication: { id: jobId, mode: 'simple' as const },
        ...getStripeEventOrdering(data),
      },
    }
  },
})

const enqueueRecoverStripeEventsJob = createEnqueueFunction<Record<string, never>, MembershipsJobs>(
  {
    queue: memberships,
    queueName: QUEUE_NAME,
    jobName: STRIPE_RECOVERY_JOB_NAME,
    defaults: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000, jitter: 0.5 },
      removeOnComplete: 100,
      removeOnFail: 100,
    },
  },
)

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
  return `stripe-event__${data.stripeEventRecordId}__${data.processingAttemptId}`
}

function getStripeEventOrdering(data: ProcessStripeEventData): Partial<JobOptions> {
  if (!data.stripeSubscriptionId) return {}
  return {
    ordering: {
      key: `stripe-subscription:${data.livemode ? 'production' : 'test'}:${data.stripeSubscriptionId}`,
      concurrency: 1,
    },
  }
}
