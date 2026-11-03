import onError from '@modules/on-error'
import { addEntityBloomKeys } from '@services/entity-cache/bloom-filter-repair'
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

export async function deliverStoryPost({
  post,
  postStory,
  storyTellerUser,
  relationEffects,
}: {
  post: Post
  postStory: PostStory
  storyTellerUser: PrivateUser
  relationEffects: StoryPostRelationEffects
}): Promise<void> {
  try {
    await dispatchStoryPostRelationEffects(storyTellerUser, {
      ...relationEffects,
      handleVotes: false,
    })
  } catch (err) {
    onError(err instanceof Error ? err : new Error(String(err)))
  }
  const bloomKeys = [normalizeKey(post.id)]
  if (post.slug) bloomKeys.push(normalizeKey(post.slug))
  void addEntityBloomKeys('posts', bloomKeys)
  await invalidateStories(postStory.story_id)
  void enqueueReconcileStoryPostRelatedUrlProjectionsBestEffort()
  void enqueueOnPostCreated(post.id)
  void enqueueStoryPostAgent(post.id)
}
