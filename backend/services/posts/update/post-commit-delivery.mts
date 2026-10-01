import { enqueueOnPostUpdated } from '@queues/entity-listeners/enqueues'
import { invalidate } from '@services/entity-cache/invalidate'
import type { Post, UpdatePostChanges } from '../types.mts'
import { entityCacheBloomFilters } from '@services/entity-cache/backfill-bloom-filter'
import { normalizeKey } from '@ts-shared/utils/strings'
import onError from '@modules/on-error'

export type PostCommitDeliveryDependencies = {
  enqueueOnPostUpdated: typeof enqueueOnPostUpdated
  invalidatePosts: typeof invalidate.posts
  onError: typeof onError
}

const defaultPostCommitDeliveryDependencies: PostCommitDeliveryDependencies = {
  enqueueOnPostUpdated,
  invalidatePosts: invalidate.posts,
  onError,
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
  if (changes.slug && updatedPost.slug) {
    void entityCacheBloomFilters.posts.add([normalizeKey(updatedPost.slug)])
  }

  await resolvedDependencies
    .invalidatePosts(previousPost, updatedPost)
    .catch(err => resolvedDependencies.onError(err instanceof Error ? err : new Error(String(err))))
  if (shouldEnqueuePostUpdated)
    void resolvedDependencies.enqueueOnPostUpdated(updatedPost.id, { contentChanged })

  return updatedPost
}
