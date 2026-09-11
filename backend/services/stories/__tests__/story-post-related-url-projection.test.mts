import { beforeAll, describe, expect, it } from 'vitest'
import {
  createTestUserDirect,
  getPostRelatedUrlIds,
  getTestStoryPostRelatedUrlDeletedById,
  getTestStoryPostProjectionReceiptCount,
  insertTestStory,
  insertTestStoryRssFeedItemsBatch,
  insertTestUrlDirect,
} from '@voucha/test-helpers'
import { getSystemUserByUsername, upsertSystemAdministrator } from '@services/users/system-users'
import { getEntityRelationMetadataOrThrow } from '@services/entity-relations/metadata'
import { upsertEntityRelation } from '@services/entity-relations/upsert'
import { softDeleteEntityRelation } from '@services/entity-relations/delete'
import type { PrivateUser } from '@services/users/types'
import { createStoryPost } from '../story-posts.mts'
import { refreshStoryPostForStory } from '../refresh-story-post.mts'
import {
  reconcileStoryPostRelatedUrlProjection,
  STORY_POST_RELATED_URL_PROJECTION_PAGE_SIZE,
} from '../story-post-related-url-projection.mts'

let testUser: PrivateUser

describe('story post related URL projection', () => {
  beforeAll(async () => {
    await upsertSystemAdministrator('story-teller')
    testUser = await createTestUserDirect()
  })

  it.each([10_000, 100_000])(
    'processes a %i-item story through bounded pages and one terminal URL decision',
    async itemCount => {
      const story = await insertTestStory({ title: `Projection scale ${crypto.randomUUID()}` })
      const url = await insertTestUrlDirect(
        null,
        `https://story-projection-scale-${crypto.randomUUID()}.example.test/article`,
      )
      expect(url).toBeDefined()
      await insertTestStoryRssFeedItemsBatch({
        storyId: story.id,
        urlId: url!.id,
        count: itemCount,
      })
      const { post } = await createStoryPost(
        story.id,
        testUser,
        {},
        {
          dispatchStoryPostRelationEffects: async () => {},
          enqueueOnPostCreated: () => {},
          enqueueStoryPostAgent: async () => {},
          enqueueReconcileStoryPostRelatedUrlProjectionsBestEffort: () => {},
          invalidateStories: async () => {},
        },
      )

      let processed = 0
      let maxPageSize = 0
      let observedReceiptCount: number | undefined
      const iterationLimit = Math.ceil(itemCount / STORY_POST_RELATED_URL_PROJECTION_PAGE_SIZE) + 10
      for (let iteration = 0; iteration < iterationLimit; iteration += 1) {
        const result = await reconcileStoryPostRelatedUrlProjection({ postId: post.id })
        maxPageSize = Math.max(maxPageSize, result.processed)
        processed += result.processed
        if (processed === itemCount && observedReceiptCount === undefined) {
          observedReceiptCount = await getTestStoryPostProjectionReceiptCount(post.id)
        }
        if (!result.continue) break
      }

      expect(maxPageSize).toBeLessThanOrEqual(STORY_POST_RELATED_URL_PROJECTION_PAGE_SIZE)
      expect(processed).toBe(itemCount)
      expect(observedReceiptCount).toBe(1)
      await expect(getPostRelatedUrlIds(post.id)).resolves.toEqual([url!.id])
      await expect(getTestStoryPostProjectionReceiptCount(post.id)).resolves.toBe(0)
    },
    180_000,
  )

  it('keeps a generation at its captured high-water until a later refresh', async () => {
    const story = await insertTestStory({ title: `Projection high-water ${crypto.randomUUID()}` })
    const [initialUrl, laterUrl] = await Promise.all([
      insertTestUrlDirect(
        null,
        `https://story-projection-initial-${crypto.randomUUID()}.example.test/article`,
      ),
      insertTestUrlDirect(
        null,
        `https://story-projection-later-${crypto.randomUUID()}.example.test/article`,
      ),
    ])
    expect(initialUrl).toBeDefined()
    expect(laterUrl).toBeDefined()
    await insertTestStoryRssFeedItemsBatch({
      storyId: story.id,
      urlId: initialUrl!.id,
      count: 2,
    })
    const { post } = await createStoryPost(
      story.id,
      testUser,
      {},
      {
        dispatchStoryPostRelationEffects: async () => {},
        enqueueOnPostCreated: () => {},
        enqueueStoryPostAgent: async () => {},
        enqueueReconcileStoryPostRelatedUrlProjectionsBestEffort: () => {},
        invalidateStories: async () => {},
      },
    )
    await insertTestStoryRssFeedItemsBatch({
      storyId: story.id,
      urlId: laterUrl!.id,
      count: 1,
    })

    await drainProjection(post.id)
    await expect(getPostRelatedUrlIds(post.id)).resolves.toEqual([initialUrl!.id])

    await refreshStoryPostForStory(story.id)
    await drainProjection(post.id)
    const projectedUrlIds = await getPostRelatedUrlIds(post.id)
    expect(projectedUrlIds).toHaveLength(2)
    expect(projectedUrlIds).toEqual(expect.arrayContaining([initialUrl!.id, laterUrl!.id]))
  })

  it('preserves a related URL reactivated after a refresh captures its prune snapshot', async () => {
    const story = await insertTestStory({
      title: `Projection relation capture ${crypto.randomUUID()}`,
    })
    const [firstUrl, secondUrl, manualUrl] = await Promise.all([
      insertTestUrlDirect(
        null,
        `https://example.com/story-projection-capture-first-${crypto.randomUUID()}`,
      ),
      insertTestUrlDirect(
        null,
        `https://example.com/story-projection-capture-second-${crypto.randomUUID()}`,
      ),
      insertTestUrlDirect(
        null,
        `https://example.com/story-projection-capture-manual-${crypto.randomUUID()}`,
      ),
    ])
    if (!firstUrl || !secondUrl || !manualUrl) throw new Error('Expected projection capture URLs')
    await Promise.all([
      insertTestStoryRssFeedItemsBatch({ storyId: story.id, urlId: firstUrl.id, count: 2 }),
      insertTestStoryRssFeedItemsBatch({ storyId: story.id, urlId: secondUrl.id, count: 2 }),
    ])
    const { post } = await createStoryPost(
      story.id,
      testUser,
      {},
      {
        dispatchStoryPostRelationEffects: async () => {},
        enqueueOnPostCreated: () => {},
        enqueueStoryPostAgent: async () => {},
        enqueueReconcileStoryPostRelatedUrlProjectionsBestEffort: () => {},
        invalidateStories: async () => {},
      },
    )
    const relatedUrl = getEntityRelationMetadataOrThrow({
      subjectType: 'post',
      predicate: 'related',
      objectType: 'url',
    })
    await upsertEntityRelation(testUser, relatedUrl, { id: post.id }, [{ id: manualUrl.id }])
    await softDeleteEntityRelation(testUser, relatedUrl, { id: post.id }, [{ id: manualUrl.id }])
    await drainProjection(post.id)

    await refreshStoryPostForStory(story.id)
    await upsertEntityRelation(testUser, relatedUrl, { id: post.id }, [{ id: manualUrl.id }])
    await drainProjection(post.id)

    await expect(getPostRelatedUrlIds(post.id)).resolves.toEqual(
      expect.arrayContaining([firstUrl.id, secondUrl.id, manualUrl.id]),
    )
  })

  it('continues the dispatcher after completing a projection when another job is claimable', async () => {
    const fixtures = [await createProjectablePost('first'), await createProjectablePost('second')]
    const posts = fixtures.map(fixture => fixture.post)
    const completingPost = posts[0]!

    await expect(
      reconcileStoryPostRelatedUrlProjection({ postId: completingPost.id }),
    ).resolves.toEqual({ processed: 2, continue: true })
    await expect(
      reconcileStoryPostRelatedUrlProjection({ postId: completingPost.id }),
    ).resolves.toEqual({ processed: 0, continue: true })

    await expect(
      reconcileStoryPostRelatedUrlProjection({
        postId: completingPost.id,
        continueDispatcherAfterCompletion: true,
      }),
    ).resolves.toEqual({ processed: 0, continue: true })
    await Promise.all(posts.map(post => drainProjection(post.id)))
  })

  it('defers stale-generation receipt cleanup to bounded worker reconciliation', async () => {
    const { post, story } = await createProjectablePost('stale-receipts')

    await expect(
      reconcileStoryPostRelatedUrlProjection({ postId: post.id }),
    ).resolves.toMatchObject({ processed: 2, continue: true })
    await expect(getTestStoryPostProjectionReceiptCount(post.id)).resolves.toBe(1)

    await refreshStoryPostForStory(story.id)
    await expect(getTestStoryPostProjectionReceiptCount(post.id)).resolves.toBe(1)

    await drainProjection(post.id)
    await expect(getTestStoryPostProjectionReceiptCount(post.id)).resolves.toBe(0)
  })

  it('attributes a pruned related URL to story-teller', async () => {
    const { post, story } = await createProjectablePost('prune-attribution')
    const manualUrl = await insertTestUrlDirect(
      null,
      `https://story-projection-prune-${crypto.randomUUID()}.example.test/article`,
    )
    if (!manualUrl) throw new Error('Expected manual projection URL')
    await drainProjection(post.id)
    const relatedUrl = getEntityRelationMetadataOrThrow({
      subjectType: 'post',
      predicate: 'related',
      objectType: 'url',
    })
    await upsertEntityRelation(testUser, relatedUrl, { id: post.id }, [{ id: manualUrl.id }])

    await refreshStoryPostForStory(story.id)
    await drainProjection(post.id)

    const storyTeller = await getSystemUserByUsername('story-teller')
    if (!storyTeller) throw new Error('Expected story-teller system user')
    await expect(getTestStoryPostRelatedUrlDeletedById(post.id, manualUrl.id)).resolves.toBe(
      storyTeller.id,
    )
  })
})

async function createProjectablePost(label: string) {
  const story = await insertTestStory({
    title: `Projection dispatcher ${label} ${crypto.randomUUID()}`,
  })
  const url = await insertTestUrlDirect(
    null,
    `https://story-${crypto.randomUUID()}.example.test/${label}/article`,
  )
  if (!url) throw new Error('Expected a public projection test URL')
  await insertTestStoryRssFeedItemsBatch({ storyId: story.id, urlId: url.id, count: 2 })
  const { post } = await createStoryPost(
    story.id,
    testUser,
    {},
    {
      dispatchStoryPostRelationEffects: async () => {},
      enqueueOnPostCreated: () => {},
      enqueueStoryPostAgent: async () => {},
      enqueueReconcileStoryPostRelatedUrlProjectionsBestEffort: () => {},
      invalidateStories: async () => {},
    },
  )
  return { post, story }
}

async function drainProjection(postId: string): Promise<void> {
  for (let iteration = 0; iteration < 20; iteration += 1) {
    const result = await reconcileStoryPostRelatedUrlProjection({ postId })
    if (!result.continue) return
  }
  throw new Error(`Projection for ${postId} did not drain`)
}
