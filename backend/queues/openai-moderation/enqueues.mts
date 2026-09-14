import { createBulkEnqueueFunction, createEnqueueFunction } from '@data-stores/valkey-glide-mq'
import type { JobOptions } from 'glide-mq'
import {
  IMAGE_QUARANTINE_RECONCILIATION_DEDUPLICATION_ID,
  POST_MODERATION_RECONCILIATION_DEDUPLICATION_ID,
  MODERATION_OMNI_SINGLE_QUEUE_NAME,
  PRIORITY_DEFAULT,
  PRIORITY_RECONCILIATION,
} from './config.mts'
import { openai_moderation_omni_single } from './queues.mts'

const ONE_MINUTE_MS = 60_000
const SINGLE_ATTEMPT_DEFAULTS = {
  attempts: 1,
  removeOnComplete: 100,
  removeOnFail: 100,
} satisfies Partial<JobOptions>

type EnqueuePostModerationOptions = {
  deduplicationKey?: string
  priority?: number
}

const enqueueCreatePostModerationJob = createEnqueueFunction<{ id: string }, 'post'>({
  queue: openai_moderation_omni_single,
  queueName: MODERATION_OMNI_SINGLE_QUEUE_NAME,
  jobName: 'post',
  defaults: SINGLE_ATTEMPT_DEFAULTS,
})

const enqueueCreateImageModerationJob = createEnqueueFunction<{ id: string }, 'image'>({
  queue: openai_moderation_omni_single,
  queueName: MODERATION_OMNI_SINGLE_QUEUE_NAME,
  jobName: 'image',
  defaults: SINGLE_ATTEMPT_DEFAULTS,
})

export const enqueueCreatePostModeration = (
  postId: string,
  options: EnqueuePostModerationOptions = {},
) => {
  const deduplicationId = options.deduplicationKey
    ? `post_moderation_${postId}_${options.deduplicationKey}`
    : `post_moderation_${postId}`
  return enqueueCreatePostModerationJob({ id: postId }, {
    priority: options.priority ?? PRIORITY_DEFAULT,
    deduplication: {
      id: deduplicationId,
      mode: 'debounce',
      ttl: ONE_MINUTE_MS,
    },
  } satisfies Partial<JobOptions>)
}

export const enqueueCreateImageModeration = (imageId: string, priority?: number) => {
  return enqueueCreateImageModerationJob({ id: imageId }, {
    priority: priority ?? PRIORITY_DEFAULT,
    deduplication: {
      id: `image_moderation_${imageId}`,
      mode: 'debounce',
      ttl: ONE_MINUTE_MS,
    },
  } satisfies Partial<JobOptions>)
}

// Bulk variants used by the backfill dispatcher: one addBulk call per batch of IDs
// streamed from the source-of-truth, instead of one round-trip per ID. Each job keeps
// the same per-ID debounce dedup as the single enqueue so re-running a backfill does
// not double-enqueue.
export const enqueueCreatePostModerationBatch = createBulkEnqueueFunction<
  string,
  { id: string },
  'post'
>({
  queue: openai_moderation_omni_single,
  queueName: MODERATION_OMNI_SINGLE_QUEUE_NAME,
  jobName: 'post',
  buildJob: (postId: string) => ({
    data: { id: postId },
    opts: {
      ...SINGLE_ATTEMPT_DEFAULTS,
      priority: PRIORITY_DEFAULT,
      deduplication: { id: `post_moderation_${postId}`, mode: 'debounce', ttl: ONE_MINUTE_MS },
    } satisfies Partial<JobOptions>,
  }),
})

export const enqueueCreateImageModerationBatch = createBulkEnqueueFunction<
  string,
  { id: string },
  'image'
>({
  queue: openai_moderation_omni_single,
  queueName: MODERATION_OMNI_SINGLE_QUEUE_NAME,
  jobName: 'image',
  buildJob: (imageId: string) => ({
    data: { id: imageId },
    opts: {
      ...SINGLE_ATTEMPT_DEFAULTS,
      priority: PRIORITY_DEFAULT,
      deduplication: { id: `image_moderation_${imageId}`, mode: 'debounce', ttl: ONE_MINUTE_MS },
    } satisfies Partial<JobOptions>,
  }),
})

const enqueueBackfillPostModerationJob = createEnqueueFunction<
  Record<string, never>,
  'backfill_posts'
>({
  queue: openai_moderation_omni_single,
  queueName: MODERATION_OMNI_SINGLE_QUEUE_NAME,
  jobName: 'backfill_posts',
  defaults: SINGLE_ATTEMPT_DEFAULTS,
})

const enqueueBackfillImageModerationJob = createEnqueueFunction<
  Record<string, never>,
  'backfill_images'
>({
  queue: openai_moderation_omni_single,
  queueName: MODERATION_OMNI_SINGLE_QUEUE_NAME,
  jobName: 'backfill_images',
  defaults: SINGLE_ATTEMPT_DEFAULTS,
})

export function enqueueBackfillPostModeration(): ReturnType<
  typeof enqueueBackfillPostModerationJob
> {
  return enqueueBackfillPostModerationJob(
    {},
    {
      priority: 100,
      deduplication: { id: 'backfill_openai_moderation_posts', mode: 'throttle', ttl: 3_600_000 },
    },
  )
}

export function enqueueBackfillImageModeration(): ReturnType<
  typeof enqueueBackfillImageModerationJob
> {
  return enqueueBackfillImageModerationJob(
    {},
    {
      priority: 100,
      deduplication: { id: 'backfill_openai_moderation_images', mode: 'throttle', ttl: 3_600_000 },
    },
  )
}

const enqueueReconcileImageQuarantinesJob = createEnqueueFunction<
  Record<string, never>,
  'reconcile_image_quarantines'
>({
  queue: openai_moderation_omni_single,
  queueName: MODERATION_OMNI_SINGLE_QUEUE_NAME,
  jobName: 'reconcile_image_quarantines',
})

/** Re-derives interrupted CSAM transfers exclusively from pending PostgreSQL rows. */
export function enqueueReconcileImageQuarantines() {
  return enqueueReconcileImageQuarantinesJob({}, {
    attempts: 1,
    removeOnComplete: 100,
    removeOnFail: 100,
    priority: PRIORITY_RECONCILIATION,
    deduplication: {
      id: IMAGE_QUARANTINE_RECONCILIATION_DEDUPLICATION_ID,
      mode: 'throttle',
      ttl: ONE_MINUTE_MS,
    },
  } satisfies JobOptions)
}

const enqueueReconcilePostModerationJob = createEnqueueFunction<
  Record<string, never>,
  'reconcile_post_moderation'
>({
  queue: openai_moderation_omni_single,
  queueName: MODERATION_OMNI_SINGLE_QUEUE_NAME,
  jobName: 'reconcile_post_moderation',
})

/** Re-derives retries and hard-deadline review transitions from PostgreSQL. */
export function enqueueReconcilePostModeration() {
  return enqueueReconcilePostModerationJob({}, {
    attempts: 1,
    removeOnComplete: 100,
    removeOnFail: 100,
    priority: PRIORITY_RECONCILIATION,
    deduplication: {
      id: POST_MODERATION_RECONCILIATION_DEDUPLICATION_ID,
      mode: 'throttle',
      ttl: ONE_MINUTE_MS,
    },
  } satisfies JobOptions)
}
