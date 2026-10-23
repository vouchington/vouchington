import { createBackgroundBulkEnqueue, createBackgroundEnqueue } from '@queues/background/enqueues'
import {
  type PostModerationReconciliationData,
  OPENAI_MODERATION_BACKFILL_IMAGES_JOB,
  OPENAI_MODERATION_BACKFILL_POSTS_JOB,
  OPENAI_MODERATION_IMAGE_JOB,
  OPENAI_MODERATION_POST_JOB,
  OPENAI_MODERATION_RECONCILE_IMAGE_QUARANTINES_JOB,
  OPENAI_MODERATION_RECONCILE_POST_MODERATION_JOB,
} from '@queues/background/enqueues/openai-moderation-jobs'
import { PRIORITY_TASK } from '@queues/background/config'
import type { JobOptions } from 'glide-mq'
import { createHash } from 'node:crypto'
import {
  IMAGE_QUARANTINE_RECONCILIATION_DEDUPLICATION_ID,
  POST_MODERATION_RECONCILIATION_DEDUPLICATION_ID,
} from './config.mts'

const ONE_MINUTE_MS = 60_000

type EnqueuePostModerationOptions = {
  deduplicationKey?: string
  priority?: number
}

const enqueueCreatePostModerationJob = createBackgroundEnqueue(OPENAI_MODERATION_POST_JOB)
const enqueueCreateImageModerationJob = createBackgroundEnqueue(OPENAI_MODERATION_IMAGE_JOB)

export const enqueueCreatePostModeration = (
  postId: string,
  options: EnqueuePostModerationOptions = {},
) => {
  const deduplicationId = options.deduplicationKey
    ? `post_moderation_${postId}_${options.deduplicationKey}`
    : `post_moderation_${postId}`
  return enqueueCreatePostModerationJob({ id: postId }, {
    priority: options.priority ?? PRIORITY_TASK,
    deduplication: {
      id: deduplicationId,
      mode: 'debounce',
    },
  } satisfies Partial<JobOptions>)
}

export const enqueueCreateImageModeration = (imageId: string, priority?: number) => {
  return enqueueCreateImageModerationJob({ id: imageId }, {
    priority: priority ?? PRIORITY_TASK,
    deduplication: {
      id: `image_moderation_${imageId}`,
      mode: 'debounce',
    },
  } satisfies Partial<JobOptions>)
}

// Bulk variants used by the backfill dispatcher: one addBulk call per batch of IDs
// streamed from the source-of-truth, instead of one round-trip per ID. Each job keeps
// the same per-ID debounce dedup as the single enqueue so re-running a backfill does
// not double-enqueue.
export const enqueueCreatePostModerationBatch = createBackgroundBulkEnqueue(
  OPENAI_MODERATION_POST_JOB,
  (postId: string) => ({
    data: { id: postId },
    opts: {
      deduplication: { id: `post_moderation_${postId}`, mode: 'debounce' },
    } satisfies Partial<JobOptions>,
  }),
)

export const enqueueCreateImageModerationBatch = createBackgroundBulkEnqueue(
  OPENAI_MODERATION_IMAGE_JOB,
  (imageId: string) => ({
    data: { id: imageId },
    opts: {
      deduplication: { id: `image_moderation_${imageId}`, mode: 'debounce' },
    } satisfies Partial<JobOptions>,
  }),
)

const enqueueBackfillPostModerationJob = createBackgroundEnqueue(
  OPENAI_MODERATION_BACKFILL_POSTS_JOB,
)
const enqueueBackfillImageModerationJob = createBackgroundEnqueue(
  OPENAI_MODERATION_BACKFILL_IMAGES_JOB,
)

export function enqueueBackfillPostModeration(): ReturnType<
  typeof enqueueBackfillPostModerationJob
> {
  return enqueueBackfillPostModerationJob(
    {},
    { deduplication: { id: 'backfill_openai_moderation_posts', mode: 'throttle', ttl: 3_600_000 } },
  )
}

export function enqueueBackfillImageModeration(): ReturnType<
  typeof enqueueBackfillImageModerationJob
> {
  return enqueueBackfillImageModerationJob(
    {},
    {
      deduplication: { id: 'backfill_openai_moderation_images', mode: 'throttle', ttl: 3_600_000 },
    },
  )
}

// A continuation carries the last id of the page before it. Its job id is that cursor, so a retried
// dispatcher cannot enqueue a second continuation, and a finished record releases the id.
const CONTINUATION_OPTIONS = { removeOnComplete: true, removeOnFail: true } as const

export function enqueueBackfillPostModerationContinuation(afterId: string) {
  return enqueueBackfillPostModerationJob(
    { afterId },
    { jobId: `backfill_openai_moderation_posts__${afterId}`, ...CONTINUATION_OPTIONS },
  )
}

export function enqueueBackfillImageModerationContinuation(afterId: string) {
  return enqueueBackfillImageModerationJob(
    { afterId },
    { jobId: `backfill_openai_moderation_images__${afterId}`, ...CONTINUATION_OPTIONS },
  )
}

const enqueueReconcileImageQuarantinesJob = createBackgroundEnqueue(
  OPENAI_MODERATION_RECONCILE_IMAGE_QUARANTINES_JOB,
)

/** Re-derives interrupted CSAM transfers exclusively from pending PostgreSQL rows. */
export function enqueueReconcileImageQuarantines() {
  return enqueueReconcileImageQuarantinesJob({}, {
    deduplication: {
      id: IMAGE_QUARANTINE_RECONCILIATION_DEDUPLICATION_ID,
      mode: 'throttle',
      ttl: ONE_MINUTE_MS,
    },
  } satisfies Partial<JobOptions>)
}

const enqueueReconcilePostModerationJob = createBackgroundEnqueue(
  OPENAI_MODERATION_RECONCILE_POST_MODERATION_JOB,
)

/** Re-derives retries and hard-deadline review transitions from PostgreSQL. */
export function enqueueReconcilePostModeration() {
  return enqueueReconcilePostModerationJob({}, {
    deduplication: {
      id: POST_MODERATION_RECONCILIATION_DEDUPLICATION_ID,
      mode: 'throttle',
      ttl: ONE_MINUTE_MS,
    },
  } satisfies Partial<JobOptions>)
}

export function enqueueReconcilePostModerationContinuation(
  cursor: NonNullable<PostModerationReconciliationData['cursor']>,
  postIds?: readonly string[],
) {
  const scopeId = postIds
    ? `__${createHash('sha256').update(JSON.stringify(postIds)).digest('hex')}`
    : ''
  return enqueueReconcilePostModerationJob(
    { cursor, ...(postIds && { postIds }) },
    {
      jobId: `post_moderation_reconciliation__${cursor.throughId}__${cursor.afterVersionId}__${cursor.afterSource}${scopeId}`,
      ...CONTINUATION_OPTIONS,
    },
  )
}
