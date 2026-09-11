import { createBulkEnqueueFunction, createEnqueueFunction } from '@data-stores/valkey-glide-mq'
import type { EnqueueReturnType } from '@voucha/types'
import type { JobOptions } from 'glide-mq'
import { PRIORITY_DEFAULT, PRIORITY_DISPATCHER, QUEUE_NAME } from '../config.mts'
import { memberships } from '../queues.mts'
import type { MembershipsJobs, ProcessStripeWebhookData } from '../types.mts'

const STRIPE_WEBHOOK_JOB_NAME: MembershipsJobs = 'processStripeWebhook'
const STRIPE_RECOVERY_JOB_NAME: MembershipsJobs = 'recoverStripeWebhooks'
const STRIPE_RECOVERY_INTERVAL_MS = 300_000

const enqueueProcessStripeWebhookJob = createEnqueueFunction<
  ProcessStripeWebhookData,
  MembershipsJobs
>({ queue: memberships, queueName: QUEUE_NAME, jobName: STRIPE_WEBHOOK_JOB_NAME })

export const enqueueBulkProcessStripeWebhooks = createBulkEnqueueFunction<
  ProcessStripeWebhookData,
  ProcessStripeWebhookData,
  MembershipsJobs
>({
  queue: memberships,
  queueName: QUEUE_NAME,
  jobName: STRIPE_WEBHOOK_JOB_NAME,
  defaults: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000, jitter: 0.5 },
    removeOnComplete: 100,
    removeOnFail: 100,
  },
  buildJob: data => {
    const jobId = stripeWebhookJobId(data)
    return {
      data,
      opts: {
        jobId,
        priority: PRIORITY_DEFAULT,
        deduplication: { id: jobId, mode: 'simple' as const },
        ...getStripeWebhookOrdering(data),
      },
    }
  },
})

const enqueueRecoverStripeWebhooksJob = createEnqueueFunction<
  Record<string, never>,
  MembershipsJobs
>({
  queue: memberships,
  queueName: QUEUE_NAME,
  jobName: STRIPE_RECOVERY_JOB_NAME,
  defaults: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000, jitter: 0.5 },
    removeOnComplete: 100,
    removeOnFail: 100,
  },
})

export function enqueueProcessStripeWebhook(data: ProcessStripeWebhookData): EnqueueReturnType {
  const jobId = stripeWebhookJobId(data)
  return enqueueProcessStripeWebhookJob(data, {
    jobId,
    priority: PRIORITY_DEFAULT,
    deduplication: { id: jobId, mode: 'simple' },
    ...getStripeWebhookOrdering(data),
  } satisfies Partial<JobOptions>)
}

export function enqueueRecoverStripeWebhooks(): EnqueueReturnType {
  const jobId = `stripe-webhook-recovery__${Math.floor(Date.now() / STRIPE_RECOVERY_INTERVAL_MS)}`
  return enqueueRecoverStripeWebhooksJob({}, {
    jobId,
    priority: PRIORITY_DISPATCHER,
    deduplication: {
      id: 'stripe-webhook-recovery',
      mode: 'throttle',
      ttl: STRIPE_RECOVERY_INTERVAL_MS,
    },
  } satisfies Partial<JobOptions>)
}

function stripeWebhookJobId(data: ProcessStripeWebhookData): string {
  return `stripe-webhook__${data.stripeEventRecordId}__${data.processingAttemptId}`
}

function getStripeWebhookOrdering(data: ProcessStripeWebhookData): Partial<JobOptions> {
  if (!data.stripeSubscriptionId) return {}
  return {
    ordering: {
      key: `stripe-subscription:${data.livemode ? 'production' : 'test'}:${data.stripeSubscriptionId}`,
      concurrency: 1,
    },
  }
}
