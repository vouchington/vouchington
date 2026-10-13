import { enqueueOnPostUpdated } from '@queues/entity-listeners/enqueues'
import { invalidate } from '@services/entity-cache/invalidate'
import type { Post, UpdatePostChanges } from '../types.mts'
import { addEntityBloomKeys } from '@services/entity-cache/bloom-filter-repair'
import { normalizeKey } from '@ts-shared/utils/strings'
import onError from '@modules/on-error'
import { settlePostCommitEffects } from '../post-commit-completion.mts'

export type PostCommitDeliveryDependencies = {
  enqueueOnPostUpdated: typeof enqueueOnPostUpdated
  invalidatePosts: typeof invalidate.posts
  onError: typeof onError
  addEntityBloomKeys: typeof addEntityBloomKeys
}

const defaultPostCommitDeliveryDependencies: PostCommitDeliveryDependencies = {
  enqueueOnPostUpdated,
  invalidatePosts: invalidate.posts,
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
  const operations: (() => Promise<unknown>)[] = []
  const slug = updatedPost.slug
  if (changes.slug && slug) {
    operations.push(() => resolvedDependencies.addEntityBloomKeys('posts', [normalizeKey(slug)]))
  }
  operations.push(() => resolvedDependencies.invalidatePosts(previousPost, updatedPost))
  if (shouldEnqueuePostUpdated) {
    operations.push(() =>
      resolvedDependencies.enqueueOnPostUpdated(updatedPost.id, { contentChanged }),
    )
  }
  await settlePostCommitEffects(
    { postId: updatedPost.id, slug: updatedPost.slug, kind: 'updated' },
    operations,
    resolvedDependencies.onError,
  )

  return updatedPost
}
