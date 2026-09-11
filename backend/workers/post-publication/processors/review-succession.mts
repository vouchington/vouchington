import type { enqueueContinuePostPublicationReconciliation } from '@queues/post-publication/enqueues'
import type { reconcileReviewSuccessionsForPostIds } from '@services/posts/review-successions/index'

type ReviewSuccessionDependencies = {
  reconcileReviewSuccessionsForPostIds: typeof reconcileReviewSuccessionsForPostIds
  enqueueContinuePostPublicationReconciliation: typeof enqueueContinuePostPublicationReconciliation
}

export async function reconcileReviewSuccessionBeforePostPublication(
  postIds: readonly string[],
  dependencies: ReviewSuccessionDependencies,
): Promise<boolean> {
  const succession = await dependencies.reconcileReviewSuccessionsForPostIds(postIds)
  if (succession.changedPostIds.length === 0) return false

  await dependencies.enqueueContinuePostPublicationReconciliation()
  return true
}
