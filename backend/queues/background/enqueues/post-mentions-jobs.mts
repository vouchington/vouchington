import { PRIORITY_TASK } from '../config.mts'
import { defineBackgroundDomain, defineBackgroundJob } from './define-job.mts'

// Mention extraction is bounded by each worker's concurrency; the old queue had no queue-wide cap,
// ordering key, or limiter, so the domain has no group.
export const POST_MENTIONS_DOMAIN = defineBackgroundDomain({
  domain: 'post-mentions',
  group: { kind: 'none' },
  workerConcurrency: 5,
})

export const POST_MENTIONS_PROCESS_JOB = defineBackgroundJob<{ postId: string }>(
  POST_MENTIONS_DOMAIN,
  { name: 'process', priority: PRIORITY_TASK },
)

export const POST_MENTIONS_JOBS = [POST_MENTIONS_PROCESS_JOB] as const
