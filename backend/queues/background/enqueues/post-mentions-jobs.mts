import { PRIORITY_TASK } from '../config.mts'
import { defineBackgroundDomain, defineBackgroundJob } from './define-job.mts'

// The old queue had no ordering key or limiter; its cap was the worker concurrency of 5. One
// domain-wide group of 5 keeps that cap on the shared worker.
export const POST_MENTIONS_DOMAIN = defineBackgroundDomain({
  domain: 'post-mentions',
  group: { kind: 'domain', concurrency: 5 },
  workerConcurrency: 5,
})

export const POST_MENTIONS_PROCESS_JOB = defineBackgroundJob<{ postId: string }>(
  POST_MENTIONS_DOMAIN,
  { name: 'process', priority: PRIORITY_TASK },
)

export const POST_MENTIONS_JOBS = [POST_MENTIONS_PROCESS_JOB] as const
