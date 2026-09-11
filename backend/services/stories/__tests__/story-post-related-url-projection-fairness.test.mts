import { beforeAll, describe, expect, it } from 'vitest'
import {
  createTestUserDirect,
  insertTestStory,
  insertTestStoryRssFeedItemsBatch,
  insertTestUrlDirect,
} from '@voucha/test-helpers'
import { createStoryPost } from '../story-posts.mts'
import { reconcileStoryPostRelatedUrlProjection } from '../story-post-related-url-projection.mts'
import { upsertSystemAdministrator } from '@services/users/system-users'
import {
  claimStoryPostRelatedUrlProjectionWork,
  releaseStoryPostRelatedUrlProjectionWork,
} from '../story-post-related-url-projection-work.mts'

describe('story post related URL projection fairness', () => {
  beforeAll(async () => {
    await upsertSystemAdministrator('story-teller')
  })

  it('rotates dispatcher claims across pending posts', async () => {
    const postIds = new Set([
      await createPendingProjectionPost('first'),
      await createPendingProjectionPost('second'),
    ])
    const claimedPostIds: string[] = []
    for (let iteration = 0; claimedPostIds.length < 4 && iteration < 100; iteration += 1) {
      const work = await claimStoryPostRelatedUrlProjectionWork()
      if (!work) throw new Error('Expected a pending projection claim')
      if (postIds.has(work.post_id)) claimedPostIds.push(work.post_id)
      await releaseStoryPostRelatedUrlProjectionWork(work)
    }

    expect(claimedPostIds).toEqual([
      claimedPostIds[0],
      claimedPostIds[1],
      claimedPostIds[0],
      claimedPostIds[1],
    ])
    expect(new Set(claimedPostIds)).toEqual(postIds)
    await Promise.all([...postIds].map(drainProjection))
  })
})

async function createPendingProjectionPost(label: string): Promise<string> {
  const story = await insertTestStory({
    title: `Projection fairness ${label} ${crypto.randomUUID()}`,
  })
  const url = await insertTestUrlDirect(
    null,
    `https://projection-fairness-${crypto.randomUUID()}.example.test/${label}`,
  )
  if (!url) throw new Error('Expected a public projection test URL')
  await insertTestStoryRssFeedItemsBatch({ storyId: story.id, urlId: url.id, count: 2 })
  const user = await createTestUserDirect()
  if (!user) throw new Error('Expected test user')
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
  return post.id
}

async function drainProjection(postId: string): Promise<void> {
  for (let iteration = 0; iteration < 20; iteration += 1) {
    const result = await reconcileStoryPostRelatedUrlProjection({ postId })
    if (!result.continue) return
  }
  throw new Error(`Projection for ${postId} did not drain`)
}
