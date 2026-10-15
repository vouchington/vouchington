import { describe, expect, it, onTestFinished } from 'vitest'
import {
  createTestUserDirect,
  insertTestStory,
  insertTestStoryRssFeedItemsBatch,
  insertTestUrlDirect,
} from '@voucha/test-helpers'
import { prepareStoryPost } from '../story-posts.mts'
import { createStoryProjectionLifetime } from '@voucha/test-helpers/story-projection-lifetime'
import { readStoryProjectionWorkForTest } from '@voucha/test-helpers/entities/story-projection-work'
import { reconcileStoryPostRelatedUrlProjection } from '../story-post-related-url-projection.mts'
import { upsertSystemUser } from '@services/users/system-users'
import {
  claimStoryPostRelatedUrlProjectionWork,
  releaseStoryPostRelatedUrlProjectionWork,
} from '../story-post-related-url-projection-work.mts'

describe('story post related URL projection fairness', () => {
  it('rotates dispatcher claims across pending posts', async () => {
    const lifetime = createStoryProjectionLifetime({
      release: releaseStoryPostRelatedUrlProjectionWork,
      drain: drainProjection,
    })
    onTestFinished(() => lifetime.finish())
    await lifetime.run(async () => {
      await upsertSystemUser('story-teller')
      const create = (label: string) => createPendingProjectionPost(label, lifetime.ownPost)
      const ownedPostIds = [await create('first'), await create('second')]
      // This exclusion witness is also a fixture we created, not an arbitrary foreign row.
      const foreignPostId = await create('foreign')
      const claimedPostIds: string[] = []
      for (let iteration = 0; claimedPostIds.length < 4 && iteration < 8; iteration += 1) {
        const work = await claimStoryPostRelatedUrlProjectionWork(undefined, ownedPostIds)
        if (!work) throw new Error('Expected a pending projection claim')
        await lifetime.withClaim(work, async () => {
          expect(ownedPostIds).toContain(work.post_id)
          claimedPostIds.push(work.post_id)
        })
      }

      expect(claimedPostIds).toEqual([
        claimedPostIds[0],
        claimedPostIds[1],
        claimedPostIds[0],
        claimedPostIds[1],
      ])
      expect(new Set(claimedPostIds)).toEqual(new Set(ownedPostIds))
      const foreign = await claimStoryPostRelatedUrlProjectionWork(foreignPostId)
      if (!foreign) throw new Error('Expected the untouched fixture projection claim')
      await lifetime.withClaim(foreign, async () => {
        expect(foreign.post_id).toBe(foreignPostId)
      })
    })
  })
})

async function createPendingProjectionPost(
  label: string,
  ownPost: (postId: string) => void,
): Promise<string> {
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
  const prepared = await prepareStoryPost(
    story.id,
    user,
    {},
    {
      dispatchStoryPostRelationEffects: async () => {},
      enqueueOnPostCreated: () => Promise.resolve(),
      enqueueStoryPostAgent: async () => {},
      enqueueReconcileStoryPostRelatedUrlProjectionsBestEffort: () => Promise.resolve(),
      invalidateStories: async () => {},
    },
  )
  const postId = prepared.response.post.id
  ownPost(postId)
  await prepared.finalize()
  return postId
}

async function drainProjection(postId: string): Promise<void> {
  for (let iteration = 0; iteration < 20; iteration += 1) {
    const result = await reconcileStoryPostRelatedUrlProjection({ postId })
    if (!result.continue) {
      const remaining = await readStoryProjectionWorkForTest([postId])
      if (remaining.length === 0) return
      throw new Error(`Projection for ${postId} stopped with durable work remaining`)
    }
  }
  throw new Error(`Projection for ${postId} did not drain`)
}
