import { beforeAll, describe, expect, it } from 'vitest'
import {
  createTestUserDirect,
  getPostRelatedUrlIds,
  insertTestStory,
  insertTestStoryRssFeedItemsBatch,
  insertTestUrlDirect,
  insertTestUrlHostname,
  updateUrlHostnameBlocked,
} from '@voucha/test-helpers'
import { upsertSystemAdministrator } from '@services/users/system-users'
import { createStoryPost } from '../story-posts.mts'
import { reconcileStoryPostRelatedUrlProjection } from '../story-post-related-url-projection.mts'

describe('story post related URL projection hostname ancestry', () => {
  beforeAll(async () => {
    await upsertSystemAdministrator('story-teller')
  })

  it('omits a URL whose ancestor hostname is blocked', async () => {
    const suffix = crypto.randomUUID()
    const parentHostname = `projection-parent-${suffix}.test`
    const childHostname = `news.${parentHostname}`
    const parentHostnameId = await insertTestUrlHostname({ hostname: parentHostname })
    const url = await insertTestUrlDirect(null, `https://${childHostname}/article`)
    if (!url) throw new Error('Expected child hostname URL')
    await updateUrlHostnameBlocked(parentHostnameId, true)
    const story = await insertTestStory({ title: `Projection ancestor block ${suffix}` })
    await insertTestStoryRssFeedItemsBatch({ storyId: story.id, urlId: url.id, count: 2 })
    const user = await createTestUserDirect()
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
    await expect(getPostRelatedUrlIds(post.id)).resolves.toEqual([])
  })
})

async function drainProjection(postId: string): Promise<void> {
  for (let iteration = 0; iteration < 20; iteration += 1) {
    const result = await reconcileStoryPostRelatedUrlProjection({ postId })
    if (!result.continue) return
  }
  throw new Error(`Projection for ${postId} did not drain`)
}
