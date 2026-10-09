import type { OpenAIModerationOmniSingleJob } from '@queues/openai-moderation/types'
import {
  upsertPostOpenAIModeration,
  upsertImageOpenAIModeration,
  markPostOpenAIModerationNoContent,
  streamUnmoderatedPostIdBatches,
  streamUnmoderatedImageIdBatches,
  reconcilePendingImageQuarantines,
} from '@services/openai-moderation'
import { getPostByAny } from '@services/posts/get'
import type { Job, Worker } from 'glide-mq'
import {
  getOpenAIRateLimitDelayMs,
  handleOpenAIRateLimit,
  isOpenAIRateLimitError,
} from '@modules/openai-utils/rate-limit'
import {
  beginPostModerationAttempt,
  checkPostClearance,
  failPostModerationAttempt,
  reconcilePostModerationWork,
  releasePostModerationAttemptForRateLimit,
} from '@services/post-clearance'
import { enqueueReconcilePostNotifications } from '@queues/notifications/enqueues'
import {
  enqueueCreatePostModerationBatch,
  enqueueCreateImageModerationBatch,
  enqueueCreatePostModeration,
} from '@queues/openai-moderation/enqueues'
import { enqueueSpamDetection } from '@queues/spam-detection/enqueues'

type OpenAIModerationJobData = { id?: string }

// A provider 429 requeues the job after the provider's `Retry-After` carried on the signal itself,
// so the worker is not needed. The parameter stays until the worker construction call site stops
// passing it.
export async function handleOpenAIModerationOmniSingleJob(
  job: Job<OpenAIModerationJobData>,
  _worker: Worker,
  scope?: { postIds?: readonly string[]; imageIds?: readonly string[] },
): Promise<unknown> {
  try {
    switch (job.name as OpenAIModerationOmniSingleJob) {
      case 'post': {
        if (!job.data.id) throw new Error('Post job requires id in job.data')
        const post = await getPostByAny(job.data.id, { readOnly: false })
        if (!post) return null
        const attempt = await beginPostModerationAttempt(post.id, 'openai_omni')
        if (!attempt) return { success: true, applied: false }
        try {
          const result = await upsertPostOpenAIModeration(post, { readOnly: false, attempt })
          await enqueueReconcilePostNotifications(post.id)

          if (result.skipped) {
            /* v8 ignore start -- valid post rows require text content; service-level tests cover direct no-content handling */
            if (result.reason === 'no_content_to_moderate') {
              await markPostOpenAIModerationNoContent(post.id, attempt)
              await checkPostClearance(post.id)
            } else if (result.reason === 'content_changed') {
              await failPostModerationAttempt(attempt, 'content_changed')
            }
            /* v8 ignore stop */
          } else {
            await checkPostClearance(post.id)
          }

          return { success: true }
        } catch (err) {
          if (isOpenAIRateLimitError(err)) {
            // The provider never evaluated the post: give the attempt back instead of spending
            // one of the three that end in staff review.
            await releasePostModerationAttemptForRateLimit(attempt, getOpenAIRateLimitDelayMs(err))
            throw err
          }
          const failure = await failPostModerationAttempt(attempt, classifyModerationError(err))
          if (failure.exhausted) await checkPostClearance(post.id)
          throw err
        }
      }
      case 'image': {
        if (!job.data.id) throw new Error('Image job requires id in job.data')
        const result = await upsertImageOpenAIModeration(job.data.id)
        return { success: true, ...result }
      }
      case 'backfill_posts': {
        let enqueued = 0
        // Stream IDs over a single pg-cursor and bulk-enqueue one addBulk per batch.
        for await (const ids of streamUnmoderatedPostIdBatches()) {
          await enqueueCreatePostModerationBatch(ids)
          enqueued += ids.length
        }
        return { enqueued }
      }
      case 'backfill_images': {
        let enqueued = 0
        for await (const ids of streamUnmoderatedImageIdBatches()) {
          await enqueueCreateImageModerationBatch(ids)
          enqueued += ids.length
        }
        return { enqueued }
      }
      case 'reconcile_image_quarantines':
        return await reconcilePendingImageQuarantines(scope?.imageIds)
      case 'reconcile_post_moderation': {
        const reconciliation = await reconcilePostModerationWork(100, scope?.postIds)
        await Promise.all(
          reconciliation.due.map(({ post_id: postId, source }) =>
            source === 'openai_omni'
              ? enqueueCreatePostModeration(postId, { deduplicationKey: 'recovery' })
              : enqueueSpamDetection(postId, { deduplicationKey: 'recovery' }),
          ),
        )
        await Promise.all(reconciliation.exhausted_post_ids.map(checkPostClearance))
        return {
          enqueued: reconciliation.due.length,
          moved_to_review: reconciliation.exhausted_post_ids.length,
        }
      }
      default:
        throw new Error(`Unknown job type: ${job.name}`)
    }
  } catch (err: unknown) {
    return handleOpenAIRateLimit(err)
  }
}

function classifyModerationError(error: unknown): string {
  if (error && typeof error === 'object' && 'code' in error && typeof error.code === 'string') {
    return error.code.slice(0, 100)
  }
  return error instanceof Error ? error.name.slice(0, 100) : 'unknown_error'
}
