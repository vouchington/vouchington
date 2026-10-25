import { PRIORITY_DISPATCH } from '../config.mts'
import { defineBackgroundDomain, defineBackgroundJob } from './define-job.mts'

// Projection reconciliation stays serial across every worker process.
export const STORY_POST_RELATED_URL_PROJECTIONS_DOMAIN = defineBackgroundDomain({
  domain: 'story-post-related-url-projections',
  workerConcurrency: 2,
})

export const STORY_POST_RELATED_URL_PROJECTIONS_RECONCILE_JOB = defineBackgroundJob(
  STORY_POST_RELATED_URL_PROJECTIONS_DOMAIN,
  { name: 'reconcile', priority: PRIORITY_DISPATCH },
)

export const STORY_POST_RELATED_URL_PROJECTIONS_JOBS = [
  STORY_POST_RELATED_URL_PROJECTIONS_RECONCILE_JOB,
] as const
