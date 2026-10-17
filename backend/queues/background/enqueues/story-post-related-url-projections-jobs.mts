import { PRIORITY_DISPATCH } from '../config.mts'
import { defineBackgroundDomain, defineBackgroundJob } from './define-job.mts'

// The old queue's single reconcile job carried one ordering key with concurrency 1, so one group
// for the whole domain keeps the reconciler a singleton across every worker.
export const STORY_POST_RELATED_URL_PROJECTIONS_DOMAIN = defineBackgroundDomain({
  domain: 'story-post-related-url-projections',
  group: { kind: 'domain', concurrency: 1 },
  workerConcurrency: 2,
})

export const STORY_POST_RELATED_URL_PROJECTIONS_RECONCILE_JOB = defineBackgroundJob<
  Record<string, never>
>(STORY_POST_RELATED_URL_PROJECTIONS_DOMAIN, { name: 'reconcile', priority: PRIORITY_DISPATCH })

export const STORY_POST_RELATED_URL_PROJECTIONS_JOBS = [
  STORY_POST_RELATED_URL_PROJECTIONS_RECONCILE_JOB,
] as const
