import { enqueueOnPostUpdated } from '@queues/entity-listeners/enqueues'
import { startPostCacheInvalidation } from '@services/entity-cache/invalidate'
import type { Post, UpdatePostChanges } from '../types.mts'
import { addEntityBloomKeys } from '@services/entity-cache/bloom-filter-repair'
import { normalizeKey } from '@ts-shared/utils/strings'
import onError from '@modules/on-error'
import { settlePostCommitEffects, type PostCommitOperation } from '../post-commit-completion.mts'

export type PostCommitDeliveryDependencies = {
  enqueueOnPostUpdated: typeof enqueueOnPostUpdated
  invalidatePosts: typeof startPostCacheInvalidation
  onError: typeof onError
  addEntityBloomKeys: typeof addEntityBloomKeys
}

const defaultPostCommitDeliveryDependencies: PostCommitDeliveryDependencies = {
  enqueueOnPostUpdated,
  invalidatePosts: startPostCacheInvalidation,
  onError,
  addEntityBloomKeys,
}

export async function finalizePostUpdateAndDeliver(
  {
    changes,
    contentChanged,
    previousPost,
    shouldEnqueuePostUpdated,
    updatedPost,
  }: {
    changes: UpdatePostChanges
    contentChanged: boolean
    previousPost: Post
    shouldEnqueuePostUpdated: boolean
    updatedPost: Post
  },
  dependencies: Partial<PostCommitDeliveryDependencies> = {},
): Promise<Post> {
  const resolvedDependencies = { ...defaultPostCommitDeliveryDependencies, ...dependencies }
  const operations: PostCommitOperation[] = []
  const slug = updatedPost.slug
  if (changes.slug && slug) {
    operations.push({
      start: () => resolvedDependencies.addEntityBloomKeys('posts', [normalizeKey(slug)]),
    })
  }
  let cacheOperation: ReturnType<typeof startPostCacheInvalidation> | undefined
  operations.push({
    start: () => {
      cacheOperation = resolvedDependencies.invalidatePosts(previousPost, updatedPost)
      return cacheOperation.completion
    },
    isRejectionReported: () => cacheOperation?.rejectionReported ?? false,
  })
  if (shouldEnqueuePostUpdated) {
    operations.push({
      start: () => resolvedDependencies.enqueueOnPostUpdated(updatedPost.id, { contentChanged }),
      isRejectionReported: () => true,
    })
  }
  await settlePostCommitEffects(
    { postId: updatedPost.id, slug: updatedPost.slug, kind: 'updated' },
    operations,
    resolvedDependencies.onError,
  )

  return updatedPost
}
