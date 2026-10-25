import { PRIORITY_TASK } from '../config.mts'
import { defineBackgroundDomain, defineBackgroundJob } from './define-job.mts'

// Domain ordering bounds post-mention work across every worker process.
export const POST_MENTIONS_DOMAIN = defineBackgroundDomain({
  domain: 'post-mentions',
  deferral: 'job',
  workerConcurrency: 5,
})

export const POST_MENTIONS_PROCESS_JOB = defineBackgroundJob<{ postId: string }>(
  POST_MENTIONS_DOMAIN,
  { name: 'process', priority: PRIORITY_TASK },
)

export const POST_MENTIONS_JOBS = [POST_MENTIONS_PROCESS_JOB] as const
