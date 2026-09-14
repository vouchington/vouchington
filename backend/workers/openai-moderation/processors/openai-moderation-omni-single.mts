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
import { Worker, type Job } from 'glide-mq'
import { handleOpenAIRateLimit } from '@modules/openai-utils/rate-limit'
import {
  beginPostModerationAttempt,
  checkPostClearance,
  failPostModerationAttempt,
  reconcilePostModerationWork,
} from '@services/post-clearance'
import { enqueueReconcilePostNotifications } from '@queues/notifications/enqueues'
import {
  enqueueCreatePostModerationBatch,
  enqueueCreateImageModerationBatch,
  enqueueCreatePostModeration,
} from '@queues/openai-moderation/enqueues'
import { enqueueSpamDetection } from '@queues/spam-detection/enqueues'

type OpenAIModerationJobData = { id?: string }

export async function handleOpenAIModerationOmniSingleJob(
  job: Job<OpenAIModerationJobData>,
  worker: Worker,
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
        } catch (error) {
          const failure = await failPostModerationAttempt(attempt, classifyModerationError(error))
          if (failure.exhausted) await checkPostClearance(post.id)
          throw error
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
        return await reconcilePendingImageQuarantines()
      case 'reconcile_post_moderation': {
        const reconciliation = await reconcilePostModerationWork()
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
  } catch (error: unknown) {
    return await handleOpenAIRateLimit(error, worker)
  }
}

function classifyModerationError(error: unknown): string {
  if (error && typeof error === 'object' && 'code' in error && typeof error.code === 'string') {
    return error.code.slice(0, 100)
  }
  return error instanceof Error ? error.name.slice(0, 100) : 'unknown_error'
}
