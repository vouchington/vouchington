import { beginTransaction } from '@data-stores/psql'
import onError from '@modules/on-error'
import { addEntityBloomKeys } from '@services/entity-cache/bloom-filter-repair'
import { getEntityRelationMetadataOrThrow } from '@services/entity-relations/metadata'
import { normalizeKey } from '@ts-shared/utils/strings'
import { enqueueOnPostCreated } from '@queues/entity-listeners/enqueues'
import { enqueueStoryPostAgent } from '@queues/ai-agents/enqueues/story-post'
import { enqueueReconcileStoryPostRelatedUrlProjectionsBestEffort } from '@queues/story-post-related-url-projections/enqueues'
import { invalidateStories } from './cache-invalidation.mts'
import { refreshStoryPostForStory } from './refresh-story-post.mts'
import type { CreatedStoryPost } from './story-post-create.mts'
import { storyPostCreationSourcesChanged } from './story-post-creation-sources.mts'
import { dispatchStoryPostRelationEffects } from './story-post-relation-effects.mts'

export async function finalizeCreatedStoryPost({
  post,
  postStory,
  storyTellerUser,
  categoryTopicRelation,
  categoryTopicRelations: initialCategoryTopicRelations,
  sourceSnapshot,
}: CreatedStoryPost): Promise<void> {
  let categoryTopicRelations = initialCategoryTopicRelations
  let projectionRefreshCommitted = false
  try {
    // An assignment may have committed after creation read the membership and before
    // it could see the new story post. Check committed sources before restarting projection.
    if (await storyPostCreationSourcesChanged(postStory.story_id, sourceSnapshot)) {
      await using query = await beginTransaction()
      const refreshed = await refreshStoryPostForStory(postStory.story_id, {
        query,
        expectedPostId: post.id,
        captureCategoryChanges: true,
      })
      await query.commit()
      if (refreshed) {
        categoryTopicRelations = refreshed.categoryTopicRelations
        projectionRefreshCommitted = true
      }
    }
  } catch (err) {
    onError(err instanceof Error ? err : new Error(String(err)))
  }

  const relatedUrlRelation = getEntityRelationMetadataOrThrow({
    subjectType: 'post',
    objectType: 'url',
    predicate: 'related',
  })
  try {
    await dispatchStoryPostRelationEffects(storyTellerUser, {
      relatedUrlRelation,
      relatedUrlRelations: [],
      categoryTopicRelation,
      categoryTopicRelations,
      handleVotes: false,
    })
  } catch (err) {
    onError(err instanceof Error ? err : new Error(String(err)))
  }
  const bloomKeys = [normalizeKey(post.id)]
  if (post.slug) bloomKeys.push(normalizeKey(post.slug))
  void addEntityBloomKeys('posts', bloomKeys)
  await invalidateStories(postStory.story_id)
  if (!projectionRefreshCommitted) void enqueueReconcileStoryPostRelatedUrlProjectionsBestEffort()
  void enqueueOnPostCreated(post.id)
  void enqueueStoryPostAgent(post.id)
}
