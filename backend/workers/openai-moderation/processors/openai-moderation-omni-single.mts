import {
  type PostModerationReconciliationData,
  OPENAI_MODERATION_BACKFILL_IMAGES_JOB,
  OPENAI_MODERATION_BACKFILL_POSTS_JOB,
  OPENAI_MODERATION_IMAGE_JOB,
  OPENAI_MODERATION_POST_JOB,
  OPENAI_MODERATION_RECONCILE_IMAGE_QUARANTINES_JOB,
  OPENAI_MODERATION_RECONCILE_POST_MODERATION_JOB,
} from '@queues/background/enqueues/openai-moderation-jobs'
import {
  upsertPostOpenAIModeration,
  upsertImageOpenAIModeration,
  markPostOpenAIModerationNoContent,
  listUnmoderatedPostIdPage,
  listUnmoderatedImageIdPage,
  type BackfillIdPage,
  reconcilePendingImageQuarantines,
} from '@services/openai-moderation'
import { getPostByAny } from '@services/posts/get'
import type { Job } from 'glide-mq'
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
  enqueueReconcilePostModerationContinuation,
  enqueueBackfillImageModerationContinuation,
  enqueueBackfillPostModerationContinuation,
  enqueueCreatePostModerationBatch,
  enqueueCreateImageModerationBatch,
  enqueueCreatePostModeration,
} from '@queues/openai-moderation/enqueues'
import { enqueueSpamDetection } from '@queues/moderation-signals/enqueues'

type OpenAIModerationJobData = { id?: string; afterId?: string } & PostModerationReconciliationData

export async function handleOpenAIModerationOmniSingleJob(
  job: Job<OpenAIModerationJobData>,
  scope?: { postIds?: readonly string[]; imageIds?: readonly string[] },
): Promise<unknown> {
  try {
    switch (job.name) {
      case OPENAI_MODERATION_POST_JOB.name: {
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
      case OPENAI_MODERATION_IMAGE_JOB.name: {
        if (!job.data.id) throw new Error('Image job requires id in job.data')
        const result = await upsertImageOpenAIModeration(job.data.id)
        return { success: true, ...result }
      }
      case OPENAI_MODERATION_BACKFILL_POSTS_JOB.name:
        return await runBackfillPage(job.data.afterId, {
          listPage: listUnmoderatedPostIdPage,
          enqueueBatch: enqueueCreatePostModerationBatch,
          enqueueContinuation: enqueueBackfillPostModerationContinuation,
        })
      case OPENAI_MODERATION_BACKFILL_IMAGES_JOB.name:
        return await runBackfillPage(job.data.afterId, {
          listPage: listUnmoderatedImageIdPage,
          enqueueBatch: enqueueCreateImageModerationBatch,
          enqueueContinuation: enqueueBackfillImageModerationContinuation,
        })
      case OPENAI_MODERATION_RECONCILE_IMAGE_QUARANTINES_JOB.name:
        return await reconcilePendingImageQuarantines(scope?.imageIds)
      case OPENAI_MODERATION_RECONCILE_POST_MODERATION_JOB.name: {
        const postIds = scope?.postIds ?? job.data.postIds
        const reconciliation = await reconcilePostModerationWork(
          undefined,
          postIds,
          job.data.cursor,
        )
        await Promise.all(
          reconciliation.due.map(({ post_id: postId, source }) =>
            source === 'openai_omni'
              ? enqueueCreatePostModeration(postId, { deduplicationKey: 'recovery' })
              : enqueueSpamDetection(postId, { deduplicationKey: 'recovery' }),
          ),
        )
        await Promise.all(reconciliation.exhausted_post_ids.map(checkPostClearance))
        if (reconciliation.nextCursor)
          await enqueueReconcilePostModerationContinuation(reconciliation.nextCursor, postIds)
        return {
          hasMore: reconciliation.hasMore,
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

// One bounded page per dispatcher run. The continuation ranks behind the moderation jobs this page
// just enqueued, so no more than one page of them ever waits.
async function runBackfillPage(
  afterId: string | undefined,
  page: {
    listPage: (afterId?: string) => Promise<BackfillIdPage>
    enqueueBatch: (ids: string[]) => Promise<unknown>
    enqueueContinuation: (afterId: string) => Promise<unknown>
  },
): Promise<{ enqueued: number; hasMore: boolean }> {
  const { ids, hasMore } = await page.listPage(afterId)
  await page.enqueueBatch(ids)
  if (hasMore) await page.enqueueContinuation(ids.at(-1)!)
  return { enqueued: ids.length, hasMore }
}

function classifyModerationError(error: unknown): string {
  if (error && typeof error === 'object' && 'code' in error && typeof error.code === 'string') {
    return error.code.slice(0, 100)
  }
  return error instanceof Error ? error.name.slice(0, 100) : 'unknown_error'
}
