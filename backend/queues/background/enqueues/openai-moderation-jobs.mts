import { PRIORITY_DISPATCH, PRIORITY_TASK } from '../config.mts'
import { defineBackgroundDomain, defineBackgroundJob } from './define-job.mts'

// The domain lane applies OpenAI moderation throughput limits across every worker.
export const OPENAI_MODERATION_DOMAIN = defineBackgroundDomain({
  domain: 'openai-moderation',
  rateLimit: { max: 10, duration: 1_000 },
  workerConcurrency: 5,
})

const taskJob = (name: string) =>
  defineBackgroundJob<{ id?: string }>(OPENAI_MODERATION_DOMAIN, {
    name,
    priority: PRIORITY_TASK,
    attempts: 1,
  })
/** A backfill dispatcher enqueues one page of ids after `afterId`, then continues from its last id. */
export type OpenAIModerationBackfillData = { afterId?: string }

export const OPENAI_MODERATION_POST_JOB = taskJob('post')
export const OPENAI_MODERATION_IMAGE_JOB = taskJob('image')
export const OPENAI_MODERATION_BACKFILL_POSTS_JOB =
  defineBackgroundJob<OpenAIModerationBackfillData>(OPENAI_MODERATION_DOMAIN, {
    name: 'backfill_posts',
    priority: PRIORITY_DISPATCH,
    attempts: 1,
  })
export const OPENAI_MODERATION_BACKFILL_IMAGES_JOB =
  defineBackgroundJob<OpenAIModerationBackfillData>(OPENAI_MODERATION_DOMAIN, {
    name: 'backfill_images',
    priority: PRIORITY_DISPATCH,
    attempts: 1,
  })
export const OPENAI_MODERATION_RECONCILE_IMAGE_QUARANTINES_JOB = defineBackgroundJob(
  OPENAI_MODERATION_DOMAIN,
  {
    name: 'reconcile_image_quarantines',
    priority: PRIORITY_DISPATCH,
    attempts: 1,
  },
)
export type PostModerationReconciliationData = {
  postIds?: readonly string[]
  cursor?: {
    afterVersionId: string
    afterSource: 'openai_omni' | 'spam_detection'
    throughId: string
  }
}
export const OPENAI_MODERATION_RECONCILE_POST_MODERATION_JOB =
  defineBackgroundJob<PostModerationReconciliationData>(OPENAI_MODERATION_DOMAIN, {
    name: 'reconcile_post_moderation',
    priority: PRIORITY_DISPATCH,
    attempts: 1,
  })

export const OPENAI_MODERATION_JOBS = [
  OPENAI_MODERATION_POST_JOB,
  OPENAI_MODERATION_IMAGE_JOB,
  OPENAI_MODERATION_BACKFILL_POSTS_JOB,
  OPENAI_MODERATION_BACKFILL_IMAGES_JOB,
  OPENAI_MODERATION_RECONCILE_IMAGE_QUARANTINES_JOB,
  OPENAI_MODERATION_RECONCILE_POST_MODERATION_JOB,
] as const
