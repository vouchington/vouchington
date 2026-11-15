import {
  enqueueBulkPostPublicationEffects,
  enqueuePostPublicationEffects,
} from '@queues/post-publication/enqueues'
import { reconcileReviewSuccessionsForPostPage } from '@services/posts/review-successions/index'
import { postPublicationWorkMaxValues } from '@services/post-publication/work-limits'
import type { PostPublicationEffectsJobData } from '@voucha/types/post-publication'
import { continuationJob, nextContinuation, subjectChainJobs } from './direct-continuations.mts'

type Continuation = NonNullable<PostPublicationEffectsJobData['continuation']>

/** Existing captured-key batches own bounded subject chains; each job handles one post. */
export async function enqueueReviewSuccessionEffects(
  data: PostPublicationEffectsJobData,
  postIds: readonly string[],
): Promise<void> {
  if (
    postIds.length > postPublicationWorkMaxValues.capture_batch_size + 1 ||
    postIds.some(id => typeof id !== 'string' || id.length === 0)
  )
    throw new TypeError('Invalid publication review succession subjects')
  await enqueueBulkPostPublicationEffects(subjectChainJobs(data, 'review_successions', postIds))
}

/** One successor-history page, retaining the existing group/candidate transaction and lock order. */
export async function processReviewSuccessionContinuation(
  data: PostPublicationEffectsJobData,
  continuation: Continuation,
): Promise<{ affectedPosts: number }> {
  const postId = continuation.subjectIds[continuation.subjectIndex]
  if (
    continuation.kind !== 'review_successions' ||
    !Number.isInteger(continuation.subjectIndex) ||
    continuation.subjectIndex < 0 ||
    typeof postId !== 'string' ||
    postId.length === 0 ||
    continuation.subjectIds.length > postPublicationWorkMaxValues.capture_batch_size
  )
    throw new TypeError('Invalid publication review succession continuation')
  const result = await reconcileReviewSuccessionsForPostPage(postId, continuation.after)
  const next = nextContinuation(continuation, result.nextCursor)
  if (next) await enqueuePostPublicationEffects(continuationJob(data, next))
  return { affectedPosts: result.changedPostIds.length }
}
