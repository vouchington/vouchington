import { beforeAll, describe, expect, it } from 'vitest'
import {
  createTestUserDirect,
  getPostRelatedUrlIds,
  insertTestStory,
  insertTestStoryRssFeedItemsBatch,
  insertTestUrlDirect,
} from '@voucha/test-helpers'
import { getEntityRelationMetadataOrThrow } from '@services/entity-relations/metadata'
import { upsertEntityRelation } from '@services/entity-relations/upsert'
import { upsertSystemAdministrator } from '@services/users/system-users'
import { createStoryPost } from '../story-posts.mts'
import { refreshStoryPostForStory } from '../refresh-story-post.mts'
import { reconcileStoryPostRelatedUrlProjection } from '../story-post-related-url-projection.mts'

describe('story post related URL projection ownership', () => {
  beforeAll(async () => {
    await upsertSystemAdministrator('story-teller')
  })

  it('preserves an active related URL re-confirmed after generation capture', async () => {
    const suffix = crypto.randomUUID()
    const [user, story, sourceUrl, manualUrl] = await Promise.all([
      createTestUserDirect(),
      insertTestStory({ title: `Projection ownership ${suffix}` }),
      insertTestUrlDirect(null, `https://story-source-${suffix}.example.test/article`),
      insertTestUrlDirect(null, `https://story-manual-${suffix}.example.test/article`),
    ])
    if (!user || !sourceUrl || !manualUrl) throw new Error('Expected projection test fixtures')
    await insertTestStoryRssFeedItemsBatch({ storyId: story.id, urlId: sourceUrl.id, count: 2 })
    const { post } = await createStoryPost(
      story.id,
      user,
      {},
      {
        dispatchStoryPostRelationEffects: async () => {},
        enqueueOnPostCreated: () => {},
        enqueueStoryPostAgent: async () => {},
        enqueueReconcileStoryPostRelatedUrlProjectionsBestEffort: () => {},
        invalidateStories: async () => {},
      },
    )
    await drainProjection(post.id)
    await refreshStoryPostForStory(story.id)
    const relatedUrl = getEntityRelationMetadataOrThrow({
      subjectType: 'post',
      predicate: 'related',
      objectType: 'url',
    })
    await upsertEntityRelation(user, relatedUrl, { id: post.id }, [{ id: manualUrl.id }])
    await refreshStoryPostForStory(story.id)
    await drainProjection(post.id)

    await expect(getPostRelatedUrlIds(post.id)).resolves.toEqual(
      expect.arrayContaining([sourceUrl.id, manualUrl.id]),
    )
  })
})

async function drainProjection(postId: string): Promise<void> {
  for (let iteration = 0; iteration < 20; iteration += 1) {
    const result = await reconcileStoryPostRelatedUrlProjection({ postId })
    if (!result.continue) return
  }
  throw new Error(`Projection for ${postId} did not drain`)
}
