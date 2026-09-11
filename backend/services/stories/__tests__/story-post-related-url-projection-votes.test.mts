import { beforeAll, describe, expect, it } from 'vitest'
import {
  clearTestStoryPostRelatedUrlVote,
  createTestUserDirect,
  getTestStoryPostRelatedUrlVoteState,
  insertTestStory,
  insertTestStoryRssFeedItemsBatch,
  insertTestUrlDirect,
} from '@voucha/test-helpers'
import { getSystemUserByUsername, upsertSystemAdministrator } from '@services/users/system-users'
import { createStoryPost } from '../story-posts.mts'
import { refreshStoryPostForStory } from '../refresh-story-post.mts'
import { reconcileStoryPostRelatedUrlProjection } from '../story-post-related-url-projection.mts'
import { writeStoryPostRelatedUrlProjectionRelations } from '../story-post-related-url-projection-relations.mts'
import {
  decideStoryPostRelatedUrlProjectionRows,
  getStoryPostRelatedUrlProjectionSourcePageForWork,
  stageStoryPostRelatedUrlProjectionReceipts,
} from '../story-post-related-url-projection-source.mts'
import {
  claimStoryPostRelatedUrlProjectionWork,
  releaseStoryPostRelatedUrlProjectionWork,
} from '../story-post-related-url-projection-work.mts'

describe('story post related URL projection votes', () => {
  beforeAll(async () => {
    await upsertSystemAdministrator('story-teller')
  })

  it('restores the story-teller vote for an existing projected relation', async () => {
    const { post, story, url } = await createProjectablePost()
    const first = await stageProjectionRelations(post.id)
    try {
      await expect(
        writeStoryPostRelatedUrlProjectionRelations(first.work, first.decisions, {
          enqueueBulkCrawlUrls: async () => {},
        }),
      ).resolves.toBe(true)
    } finally {
      await releaseStoryPostRelatedUrlProjectionWork(first.work)
    }
    await clearTestStoryPostRelatedUrlVote(post.id, url.id)
    await refreshStoryPostForStory(story.id)

    const restarted = await stageProjectionRelations(post.id)
    try {
      await expect(
        writeStoryPostRelatedUrlProjectionRelations(restarted.work, restarted.decisions, {
          enqueueBulkCrawlUrls: async () => {},
        }),
      ).resolves.toBe(true)
      const storyTeller = await getSystemUserByUsername('story-teller')
      if (!storyTeller) throw new Error('Expected story-teller system user')
      await expect(getTestStoryPostRelatedUrlVoteState(post.id, url.id)).resolves.toEqual({
        votesScoreNet: 1,
        voterId: storyTeller.id,
        score: 1,
      })
    } finally {
      await releaseStoryPostRelatedUrlProjectionWork(restarted.work)
      await drainProjection(post.id)
    }
  })
})

async function stageProjectionRelations(postId: string) {
  const work = await claimStoryPostRelatedUrlProjectionWork(postId)
  if (!work) throw new Error('Expected projection work')
  const sourceRows = await getStoryPostRelatedUrlProjectionSourcePageForWork(work)
  const decisions = await decideStoryPostRelatedUrlProjectionRows(work, sourceRows)
  await expect(stageStoryPostRelatedUrlProjectionReceipts(work, decisions)).resolves.toBe(true)
  return { work, decisions }
}

async function createProjectablePost() {
  const suffix = crypto.randomUUID()
  const story = await insertTestStory({ title: `Projection vote ${suffix}` })
  const url = await insertTestUrlDirect(null, `https://story-vote-${suffix}.example.test/article`)
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
  return { post, story, url }
}

async function drainProjection(postId: string): Promise<void> {
  for (let iteration = 0; iteration < 20; iteration += 1) {
    const result = await reconcileStoryPostRelatedUrlProjection({ postId })
    if (!result.continue) return
  }
  throw new Error(`Projection for ${postId} did not drain`)
}
