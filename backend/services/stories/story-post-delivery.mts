import onError from '@modules/on-error'
import { entityCacheBloomFilters } from '@services/entity-cache/backfill-bloom-filter'
import { normalizeKey } from '@ts-shared/utils/strings'
import { enqueueOnPostCreated } from '@queues/entity-listeners/enqueues'
import { enqueueStoryPostAgent } from '@queues/ai-agents/enqueues/story-post'
import { enqueueReconcileStoryPostRelatedUrlProjectionsBestEffort } from '@queues/story-post-related-url-projections/enqueues'
import type { PrivateUser } from '@services/users/types'
import type { Post } from '@services/posts/types'
import type { PostStory } from './types.mts'
import { invalidateStories } from './cache-invalidation.mts'
import {
  dispatchStoryPostRelationEffects,
  type StoryPostRelationEffects,
} from './story-post-relation-effects.mts'

export type StoryPostDeliveryDependencies = {
  dispatchStoryPostRelationEffects: typeof dispatchStoryPostRelationEffects
  enqueueOnPostCreated: typeof enqueueOnPostCreated
  enqueueStoryPostAgent: typeof enqueueStoryPostAgent
  enqueueReconcileStoryPostRelatedUrlProjectionsBestEffort: typeof enqueueReconcileStoryPostRelatedUrlProjectionsBestEffort
  invalidateStories: typeof invalidateStories
  onError: typeof onError
}

const defaultStoryPostDeliveryDependencies: StoryPostDeliveryDependencies = {
  dispatchStoryPostRelationEffects,
  enqueueOnPostCreated,
  enqueueStoryPostAgent,
  enqueueReconcileStoryPostRelatedUrlProjectionsBestEffort,
  invalidateStories,
  onError,
}

export async function deliverStoryPost(
  {
    post,
    postStory,
    storyTellerUser,
    relationEffects,
  }: {
    post: Post
    postStory: PostStory
    storyTellerUser: PrivateUser
    relationEffects: StoryPostRelationEffects
  },
  dependencies: Partial<StoryPostDeliveryDependencies> = {},
): Promise<void> {
  const resolvedDependencies = { ...defaultStoryPostDeliveryDependencies, ...dependencies }
  try {
    await resolvedDependencies.dispatchStoryPostRelationEffects(storyTellerUser, {
      ...relationEffects,
      handleVotes: false,
    })
  } catch (error) {
    resolvedDependencies.onError(error instanceof Error ? error : new Error(String(error)))
  }
  const bloomKeys = [normalizeKey(post.id)]
  if (post.slug) bloomKeys.push(normalizeKey(post.slug))
  entityCacheBloomFilters.posts.add(bloomKeys)
  await resolvedDependencies.invalidateStories(postStory.story_id)
  resolvedDependencies.enqueueReconcileStoryPostRelatedUrlProjectionsBestEffort()
  void resolvedDependencies.enqueueOnPostCreated(post.id)
  void resolvedDependencies.enqueueStoryPostAgent(post.id)
}
