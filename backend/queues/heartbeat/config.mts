import type { JobOptions } from 'glide-mq'

export const QUEUE_NAME = 'heartbeat'
export const GLIDE_MQ_STATS_JOB_NAME = 'publish-glidemq-stats' as const

export const GLIDE_MQ_STATS_JOB_OPTIONS = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 1000, jitter: 0.5 },
  removeOnComplete: 100,
  removeOnFail: 100,
} satisfies Partial<JobOptions>
