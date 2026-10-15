import { PRIORITY_DISPATCH, PRIORITY_TASK } from '../config.mts'
import { defineBackgroundDomain, defineBackgroundJob } from './define-job.mts'

// OpenAI's moderation endpoint is the external limit: 10 starts per second across every worker.
// The group concurrency never binds; worker concurrency bounds jobs in flight, and the group
// exists for its `rateLimit`, which replaces the old queue-wide limiter.
export const OPENAI_MODERATION_DOMAIN = defineBackgroundDomain({
  domain: 'openai-moderation',
  group: { kind: 'domain', concurrency: 50, rateLimit: { max: 10, duration: 1_000 } },
  workerConcurrency: 5,
})

const taskJob = (name: string) =>
  defineBackgroundJob<{ id?: string }>(OPENAI_MODERATION_DOMAIN, {
    name,
    priority: PRIORITY_TASK,
    attempts: 1,
  })
function dispatchJob<TData = Record<string, never>>(name: string) {
  return defineBackgroundJob<TData>(OPENAI_MODERATION_DOMAIN, {
    name,
    priority: PRIORITY_DISPATCH,
    attempts: 1,
  })
}

/** A backfill dispatcher enqueues one page of ids after `afterId`, then continues from its last id. */
export type OpenAIModerationBackfillData = { afterId?: string }

export const OPENAI_MODERATION_POST_JOB = taskJob('post')
export const OPENAI_MODERATION_IMAGE_JOB = taskJob('image')
export const OPENAI_MODERATION_BACKFILL_POSTS_JOB =
  dispatchJob<OpenAIModerationBackfillData>('backfill_posts')
export const OPENAI_MODERATION_BACKFILL_IMAGES_JOB =
  dispatchJob<OpenAIModerationBackfillData>('backfill_images')
export const OPENAI_MODERATION_RECONCILE_IMAGE_QUARANTINES_JOB = dispatchJob(
  'reconcile_image_quarantines',
)
export const OPENAI_MODERATION_RECONCILE_POST_MODERATION_JOB = dispatchJob(
  'reconcile_post_moderation',
)

export const OPENAI_MODERATION_JOBS = [
  OPENAI_MODERATION_POST_JOB,
  OPENAI_MODERATION_IMAGE_JOB,
  OPENAI_MODERATION_BACKFILL_POSTS_JOB,
  OPENAI_MODERATION_BACKFILL_IMAGES_JOB,
  OPENAI_MODERATION_RECONCILE_IMAGE_QUARANTINES_JOB,
  OPENAI_MODERATION_RECONCILE_POST_MODERATION_JOB,
] as const
