import type { JobOptions } from 'glide-mq'

export const QUEUE_NAME = 'heartbeat'
export const HEARTBEAT_JOB_NAME = 'heartbeat' as const
export const GLIDE_MQ_STATS_JOB_NAME = 'publish-glidemq-stats' as const

export const HEARTBEAT_JOB_OPTIONS = {
  attempts: 1,
  removeOnComplete: 100,
  removeOnFail: 100,
  priority: 10,
} satisfies Partial<JobOptions>

export const GLIDE_MQ_STATS_JOB_OPTIONS = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 1000, jitter: 0.5 },
  removeOnComplete: 100,
  removeOnFail: 100,
} satisfies Partial<JobOptions>
