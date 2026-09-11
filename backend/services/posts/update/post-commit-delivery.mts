import { getPostByAny } from '../get.mts'
import onError from '@modules/on-error'
import { enqueueOnPostUpdated } from '@queues/entity-listeners/enqueues'
import { invalidate } from '@services/entity-cache/invalidate'
import {
  enqueuePostCategoryFinalizationReconciliationBestEffort,
  reconcilePostCategoryFinalization,
  type PostCategoryFinalization,
} from '../post-category-finalizations.mts'
import type { Post, UpdatePostChanges } from '../types.mts'

export type PostCommitDeliveryDependencies = {
  enqueuePostCategoryFinalizationReconciliationBestEffort: typeof enqueuePostCategoryFinalizationReconciliationBestEffort
  enqueueOnPostUpdated: typeof enqueueOnPostUpdated
  getPostByAny: typeof getPostByAny
  invalidatePosts: typeof invalidate.posts
  onError: typeof onError
  reconcilePostCategoryFinalization: typeof reconcilePostCategoryFinalization
}

const defaultPostCommitDeliveryDependencies: PostCommitDeliveryDependencies = {
  enqueuePostCategoryFinalizationReconciliationBestEffort,
  enqueueOnPostUpdated,
  getPostByAny,
  invalidatePosts: invalidate.posts,
  onError,
  reconcilePostCategoryFinalization,
}

export async function finalizePostUpdateAndDeliver(
  {
    changes,
    contentChanged,
    previousPost,
    shouldEnqueuePostUpdated,
    syncHashtagCategories,
    postCategoryFinalization,
    updatedPost,
  }: {
    changes: UpdatePostChanges
    contentChanged: boolean
    previousPost: Post
    shouldEnqueuePostUpdated: boolean
    syncHashtagCategories: boolean
    postCategoryFinalization?: PostCategoryFinalization
    updatedPost: Post
  },
  dependencies: Partial<PostCommitDeliveryDependencies> = {},
): Promise<Post> {
  const resolvedDependencies = { ...defaultPostCommitDeliveryDependencies, ...dependencies }
  let finalizedPost = updatedPost
  try {
    if (syncHashtagCategories || changes.structured_data !== undefined) {
      await resolvedDependencies.reconcilePostCategoryFinalization(postCategoryFinalization!)
      finalizedPost = (await resolvedDependencies.getPostByAny(updatedPost.id, {
        readOnly: false,
      }))!
    }
    await resolvedDependencies.invalidatePosts(previousPost, finalizedPost)
  } catch (error) {
    // The committed finalization row is replayed by the reconciliation job; report the immediate
    // replay failure without turning a successful edit into a retry-inducing API error.
    if (postCategoryFinalization)
      void resolvedDependencies.enqueuePostCategoryFinalizationReconciliationBestEffort()
    resolvedDependencies.onError(error instanceof Error ? error : new Error(String(error)))
  }

  if (shouldEnqueuePostUpdated) {
    void resolvedDependencies.enqueueOnPostUpdated(updatedPost.id, { contentChanged })
  }

  return finalizedPost
}
