import type { PrivateUser } from '@services/users/types'
import type { CreatePostInput } from '../types.mts'
import type { CommunityPostReview } from '@services/communities/types'
import { normalizeKey } from '@ts-shared/utils/strings'
import { entityCacheBloomFilters } from '@services/entity-cache/backfill-bloom-filter'
import { enqueueOnPostCreated } from '@queues/entity-listeners/enqueues'
import { enqueueBulkCommunityModerationDispatchers } from '@queues/ai-agents/enqueues/community-moderation'

type PostCommitSideEffectsDependencies = {
  enqueueBulkCommunityModerationDispatchers: typeof enqueueBulkCommunityModerationDispatchers
  enqueueOnPostCreated: typeof enqueueOnPostCreated
}

const defaultPostCommitSideEffectsDependencies: PostCommitSideEffectsDependencies = {
  enqueueBulkCommunityModerationDispatchers,
  enqueueOnPostCreated,
}

export async function applyPostCommitSideEffects(
  input: {
    communityReviews: CommunityPostReview[]
    creator: PrivateUser
    isAdminCreator: boolean
    post: { id: string; slug?: string | null }
    postType: NonNullable<CreatePostInput['post_type']>
    updates: CreatePostInput
  },
  dependencies: Partial<PostCommitSideEffectsDependencies> = {},
): Promise<void> {
  const { communityReviews, isAdminCreator, post } = input
  const resolvedDependencies = { ...defaultPostCommitSideEffectsDependencies, ...dependencies }
  const bloomKeys = [normalizeKey(post.id)]
  if (post.slug) bloomKeys.push(normalizeKey(post.slug))
  void entityCacheBloomFilters.posts.add(bloomKeys)
  void resolvedDependencies.enqueueOnPostCreated(post.id)
  if (!isAdminCreator) {
    const autoApproved = communityReviews.flatMap(review =>
      review.approved_at ? [{ postId: post.id, communityId: review.community_id }] : [],
    )
    void resolvedDependencies.enqueueBulkCommunityModerationDispatchers(autoApproved)
  }
}
