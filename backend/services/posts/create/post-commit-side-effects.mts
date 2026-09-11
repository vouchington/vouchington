import type { PrivateUser } from '@services/users/types'
import type { CreatePostInput, Post } from '../types.mts'
import type { CommunityPostReview } from '@services/communities/types'
import { normalizeKey } from '@ts-shared/utils/strings'
import { entityCacheBloomFilters } from '@services/entity-cache/backfill-bloom-filter'
import { enqueueOnPostCreated } from '@queues/entity-listeners/enqueues'
import { enqueueBulkCommunityModerationDispatchers } from '@queues/ai-agents/enqueues/community-moderation'
import onError from '@modules/on-error'
import {
  enqueuePostCategoryFinalizationReconciliationBestEffort,
  reconcilePostCategoryFinalization,
  type PostCategoryFinalization,
} from '../post-category-finalizations.mts'

type PostCommitSideEffectsDependencies = {
  enqueueBulkCommunityModerationDispatchers: typeof enqueueBulkCommunityModerationDispatchers
  enqueueOnPostCreated: typeof enqueueOnPostCreated
  enqueuePostCategoryFinalizationReconciliationBestEffort: typeof enqueuePostCategoryFinalizationReconciliationBestEffort
  onError: typeof onError
  reconcilePostCategoryFinalization: typeof reconcilePostCategoryFinalization
}

const defaultPostCommitSideEffectsDependencies: PostCommitSideEffectsDependencies = {
  enqueueBulkCommunityModerationDispatchers,
  enqueueOnPostCreated,
  enqueuePostCategoryFinalizationReconciliationBestEffort,
  onError,
  reconcilePostCategoryFinalization,
}

export async function applyPostCommitSideEffects(
  input: {
    communityReviews: CommunityPostReview[]
    creator: PrivateUser
    isAdminCreator: boolean
    post: { id: string; slug?: string | null }
    postCategoryFinalization: PostCategoryFinalization
    postType: NonNullable<CreatePostInput['post_type']>
    updates: CreatePostInput
  },
  dependencies: Partial<PostCommitSideEffectsDependencies> = {},
): Promise<Post['post_related_topics'] | undefined> {
  const { communityReviews, isAdminCreator, post, postCategoryFinalization } = input
  const resolvedDependencies = { ...defaultPostCommitSideEffectsDependencies, ...dependencies }
  const bloomKeys = [normalizeKey(post.id)]
  if (post.slug) bloomKeys.push(normalizeKey(post.slug))
  entityCacheBloomFilters.posts.add(bloomKeys)
  let createResponseTopics: Post['post_related_topics'] | undefined
  try {
    createResponseTopics =
      await resolvedDependencies.reconcilePostCategoryFinalization(postCategoryFinalization)
  } catch (error) {
    // The committed finalization row is replayed by the reconciliation job; do not turn a
    // successful create into an error or skip its independent post-created listeners.
    resolvedDependencies.onError(error as Error)
    void resolvedDependencies.enqueuePostCategoryFinalizationReconciliationBestEffort()
  }
  void resolvedDependencies.enqueueOnPostCreated(post.id)
  if (!isAdminCreator) {
    const autoApproved = communityReviews.flatMap(review =>
      review.approved_at ? [{ postId: post.id, communityId: review.community_id }] : [],
    )
    void resolvedDependencies.enqueueBulkCommunityModerationDispatchers(autoApproved)
  }
  return createResponseTopics
}
