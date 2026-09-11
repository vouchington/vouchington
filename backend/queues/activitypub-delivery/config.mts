import type { JobOptions } from 'glide-mq'

export const QUEUE_NAME = 'activitypub-delivery'
export const PRIORITY_DEFAULT = 10

export const ACTIVITYPUB_DELIVERY_DEFAULTS = {
  attempts: 5,
  backoff: { type: 'exponential' as const, delay: 2000, jitter: 0.5 },
  removeOnComplete: 100,
  removeOnFail: 100,
} satisfies Partial<JobOptions>
