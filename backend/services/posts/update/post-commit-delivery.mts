import { enqueueOnPostUpdated } from '@queues/entity-listeners/enqueues'
import { startPostCacheInvalidation } from '@services/entity-cache/invalidate'
import type { Post, UpdatePostChanges } from '../types.mts'
import { addEntityBloomKeys } from '@services/entity-cache/bloom-filter-repair'
import { normalizeKey } from '@ts-shared/utils/strings'
import { settlePostCommitEffects, type PostCommitOperation } from '../post-commit-completion.mts'

export async function finalizePostUpdateAndDeliver({
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
}): Promise<Post> {
  const operations: PostCommitOperation[] = []
  const slug = updatedPost.slug
  if (changes.slug && slug) {
    operations.push({
      start: () => addEntityBloomKeys('posts', [normalizeKey(slug)]),
    })
  }
  let cacheOperation: ReturnType<typeof startPostCacheInvalidation> | undefined
  operations.push({
    start: () => {
      cacheOperation = startPostCacheInvalidation(previousPost, updatedPost)
      return cacheOperation.completion
    },
    isRejectionReported: () => cacheOperation?.rejectionReported ?? false,
  })
  if (shouldEnqueuePostUpdated) {
    operations.push({
      start: () => enqueueOnPostUpdated(updatedPost.id, { contentChanged }),
      isRejectionReported: () => true,
    })
  }
  await settlePostCommitEffects(operations)

  return updatedPost
}
