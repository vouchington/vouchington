import { it, expect, beforeAll, describe, vi } from 'vitest'
import * as storyLifecycleLock from '@services/post-publication/story-lifecycle-lock'
import { adminAssignItemToStory, adminRemoveItemFromStory } from './assign.mts'
import { getStoryItemIds } from './get.mts'
import {
  beginTransaction,
  createTestUserDirect,
  insertTestStory,
  setTestItemStoryLocked,
  setTestItemStoryId,
  insertTestRssFeedItem,
  createTestUrlWithHostname,
  createTestTopic,
  getPostCategoryTopicIds,
  getPostRelatedUrlIds,
  addCategoryToRssFeedItem,
  withTestStoryLifecycleLock,
} from '@voucha/test-helpers'
import { createTestRssFeed } from '@voucha/test-helpers/rss-feed-create'
import { createHash, randomUUID } from 'node:crypto'
import { upsertSystemUser } from '@services/users/system-users'
import { prepareStoryPost } from './story-posts.mts'
import { refreshStoryPostForStory } from './refresh-story-post.mts'
import { captureAddedPublicationEffectsForScope } from '@voucha/test-helpers/publication-effect-jobs'
import { invalidateStories } from './cache-invalidation.mts'
import { settleStoryPostTopicVoteCapture } from '../../test-helpers/services/stories/post-topic-vote-capture.mts'
import { drainStoryPostRelatedUrlProjection } from '../../test-helpers/services/stories/story-post-related-url-projection.mts'
import type { PrivateUser } from '@services/users/types'
describe('assign', () => {
  let storyPostUser: PrivateUser
  function sha256(data: unknown): Buffer {
    return createHash('sha256').update(JSON.stringify(data)).digest()
  }
  async function makeTestItem(): Promise<string> {
    const feed = await createTestRssFeed({})
    const urlId = await createTestUrlWithHostname()
    const random = Math.random().toString(36).slice(2, 10)
    const itemData = { title: `Assign Test Item ${random}`, link: `https://example.com/${random}` }
    return insertTestRssFeedItem({
      rssFeedId: feed.id,
      urlId,
      guid: `assign-test-${random}`,
      itemData,
      contentSha256: sha256(itemData),
    })
  }
  async function makeTestItemForUrl(urlId: string): Promise<string> {
    const feed = await createTestRssFeed({})
    const random = Math.random().toString(36).slice(2, 10)
    const itemData = { title: `Assign Test Item ${random}`, link: `https://example.com/${random}` }
    return insertTestRssFeedItem({
      rssFeedId: feed.id,
      urlId,
      guid: `assign-test-${random}`,
      itemData,
      contentSha256: sha256(itemData),
    })
  }
  async function createStoryWithPost(itemUrlIds: string[]) {
    const story = await insertTestStory()
    const itemIds: string[] = []
    for (const urlId of itemUrlIds) {
      const itemId = await makeTestItemForUrl(urlId)
      await setTestItemStoryId(itemId, story.id)
      itemIds.push(itemId)
    }
    const prepared = await prepareStoryPost(story.id, storyPostUser)
    await prepared.finalize()
    const { post } = prepared.response
    return { story, post, itemIds }
  }
  beforeAll(async () => {
    await upsertSystemUser('story-teller')
    storyPostUser = await createTestUserDirect()
    // Pre-warm the DB connection by creating one item at setup
    await makeTestItem()
  })
  it('adminAssignItemToStory assigns item and sets story_locked_at', async () => {
    const story = await insertTestStory()
    const newItemId = await makeTestItem()
    const result = await adminAssignItemToStory(storyPostUser.id, story.id, newItemId)
    expect(result).toBe(newItemId)
    const ids = await getStoryItemIds(story.id)
    expect(ids).toContain(newItemId)
  })
  it('rolls back the assignment when transactional relation refresh fails', async () => {
    const story = await insertTestStory()
    const itemId = await makeTestItem()
    await expect(
      adminAssignItemToStory(storyPostUser.id, story.id, itemId, {
        refreshStoryPostForStory: async () => {
          throw new Error('refresh failed')
        },
      }),
    ).rejects.toThrow('refresh failed')
    await expect(getStoryItemIds(story.id)).resolves.not.toContain(itemId)
  })
  it('adminAssignItemToStory overrides existing lock', async () => {
    const story = await insertTestStory()
    const newItemId = await makeTestItem()
    await setTestItemStoryLocked(newItemId, true)
    // Admin can bypass the lock
    const result = await adminAssignItemToStory(storyPostUser.id, story.id, newItemId)
    expect(result).toBe(newItemId)
  })
  it('captures publication only after refreshed story relations in the same transaction', async () => {
    const [firstUrlId, secondUrlId] = await Promise.all([
      createTestUrlWithHostname(),
      createTestUrlWithHostname(),
    ])
    const { story, post } = await createStoryWithPost([firstUrlId, secondUrlId])
    const itemId = await makeTestItem()
    const topic = await createTestTopic({ name: `Story capture order ${randomUUID()}` })
    await addCategoryToRssFeedItem(itemId, topic.id)
    const enqueuedPostIds: string[] = []
    const jobs = await captureAddedPublicationEffectsForScope(post.id, () =>
      adminAssignItemToStory(storyPostUser.id, story.id, itemId, {
        refreshStoryPostForStory: async (refreshedStoryId, refreshOptions, refreshBehavior) => {
          expect(refreshBehavior?.enqueueAgent).toBe(false)
          expect(refreshedStoryId).toBe(story.id)
          if (!refreshOptions?.query) throw new Error('Expected transactional story refresh')
          return refreshStoryPostForStory(refreshedStoryId, refreshOptions, refreshBehavior)
        },
        enqueueStoryPostAgent: async postId => {
          enqueuedPostIds.push(postId)
        },
      }),
    )
    await settleStoryPostTopicVoteCapture(post.id, topic.id)
    await drainStoryPostRelatedUrlProjection(post.id)
    expect(enqueuedPostIds).toEqual([post.id])
    await expect(getPostCategoryTopicIds(post.id)).resolves.toContain(topic.id)
    expect(jobs.map(job => job.reason)).toEqual(
      expect.arrayContaining(['post_updated', 'post_topics_changed']),
    )
    expect(jobs.flatMap(job => job.keys)).toContainEqual({
      kind: 'impact_topic',
      uuidValue: topic.id,
    })
  })
  it('adminAssignItemToStory refreshes prior story when item moves between stories', async () => {
    const story1 = await insertTestStory()
    const story2 = await insertTestStory()
    const itemId = await makeTestItem()
    await adminAssignItemToStory(storyPostUser.id, story1.id, itemId)
    const result = await adminAssignItemToStory(storyPostUser.id, story2.id, itemId)
    expect(result).toBe(itemId)
    const ids = await getStoryItemIds(story2.id)
    expect(ids).toContain(itemId)
  })
  it('serializes overlapping admin assignment and removal before projecting final story relations', async () => {
    const [retainedUrlId, assignedUrlId] = await Promise.all([
      createTestUrlWithHostname(),
      createTestUrlWithHostname(),
    ])
    const { story, post } = await createStoryWithPost([retainedUrlId, retainedUrlId])
    const assignedItemId = await makeTestItemForUrl(assignedUrlId)
    const assignedTopic = await createTestTopic({ name: `Story overlap topic ${randomUUID()}` })
    await addCategoryToRssFeedItem(assignedItemId, assignedTopic.id)
    const entered = Promise.withResolvers<void>()
    const lockLifecycles = storyLifecycleLock.lockStoryLifecycles
    const lifecycleSpy = vi
      .spyOn(storyLifecycleLock, 'lockStoryLifecycles')
      .mockImplementation((query, storyIds) => {
        entered.resolve()
        return lockLifecycles(query, storyIds)
      })
    let assign: Promise<string | null>
    let remove: Promise<string | null>
    try {
      await withTestStoryLifecycleLock(story.id, async () => {
        assign = adminAssignItemToStory(storyPostUser.id, story.id, assignedItemId)
        await entered.promise
        await using probe = await beginTransaction()
        await probe(`/* testAssign */ SET LOCAL lock_timeout = '50ms'`)
        await expect(
          probe(`/* testAssign */ SELECT id FROM rss_feed_items WHERE id = $1::uuid FOR UPDATE`, [
            assignedItemId,
          ]),
        ).rejects.toMatchObject({ code: '55P03' })
        remove = adminRemoveItemFromStory(storyPostUser.id, assignedItemId)
      })
    } finally {
      lifecycleSpy.mockRestore()
    }
    await expect(Promise.all([assign!, remove!])).resolves.toEqual([assignedItemId, assignedItemId])

    await expect(getStoryItemIds(story.id)).resolves.not.toContain(assignedItemId)
    await drainStoryPostRelatedUrlProjection(post.id)
    await expect(getPostRelatedUrlIds(post.id)).resolves.toEqual([retainedUrlId])
    await expect(getPostCategoryTopicIds(post.id)).resolves.not.toContain(assignedTopic.id)
  })

  it('adminRemoveItemFromStory removes item and sets story_locked_at', async () => {
    const story = await insertTestStory()
    const newItemId = await makeTestItem()
    await adminAssignItemToStory(storyPostUser.id, story.id, newItemId)
    const result = await adminRemoveItemFromStory(storyPostUser.id, newItemId)
    expect(result).toBe(newItemId)
  })

  it('adminAssignItemToStory makes the assigned item visible in membership reads', async () => {
    const story = await insertTestStory()
    const newItemId = await makeTestItem()
    await adminAssignItemToStory(storyPostUser.id, story.id, newItemId)
    await expect(getStoryItemIds(story.id)).resolves.toContain(newItemId)
  })

  it('refreshes moved story posts before invalidating their caches', async () => {
    const [movedUrlId, priorOtherUrlId, targetUrlId1, targetUrlId2] = await Promise.all([
      createTestUrlWithHostname(),
      createTestUrlWithHostname(),
      createTestUrlWithHostname(),
      createTestUrlWithHostname(),
    ])
    const prior = await createStoryWithPost([movedUrlId, priorOtherUrlId])
    const target = await createStoryWithPost([targetUrlId1, targetUrlId2])
    const movedItemId = prior.itemIds[0]!
    const topic = await createTestTopic({ name: `Story move ordering ${randomUUID()}` })
    await addCategoryToRssFeedItem(movedItemId, topic.id)
    await refreshStoryPostForStory(prior.story.id)
    const completedRefreshes = new Set<string>()
    await adminAssignItemToStory(storyPostUser.id, target.story.id, movedItemId, {
      refreshStoryPostForStory: async (storyId, refreshOptions, refreshBehavior) => {
        expect(refreshBehavior?.enqueueAgent).toBe(false)
        const result = await refreshStoryPostForStory(storyId, refreshOptions, refreshBehavior)
        completedRefreshes.add(storyId)
        return result
      },
      invalidateStories: async (...storyIds) => {
        expect(completedRefreshes).toEqual(new Set([prior.story.id, target.story.id]))
        expect(await getPostCategoryTopicIds(target.post.id)).toContain(topic.id)
        await invalidateStories(...storyIds)
      },
    })
    await Promise.all([
      drainStoryPostRelatedUrlProjection(prior.post.id),
      drainStoryPostRelatedUrlProjection(target.post.id),
    ])
    await expect(getPostRelatedUrlIds(prior.post.id)).resolves.not.toContain(movedUrlId)
    await expect(getPostRelatedUrlIds(target.post.id)).resolves.toContain(movedUrlId)
  })

  it('refreshes the former story post before invalidating its cache after removal', async () => {
    const [removedUrlId, retainedUrlId] = await Promise.all([
      createTestUrlWithHostname(),
      createTestUrlWithHostname(),
    ])
    const { story, post, itemIds } = await createStoryWithPost([removedUrlId, retainedUrlId])
    const removedTopic = await createTestTopic({ name: `Story removal topic ${randomUUID()}` })
    await addCategoryToRssFeedItem(itemIds[0]!, removedTopic.id)
    await refreshStoryPostForStory(story.id)
    await settleStoryPostTopicVoteCapture(post.id, removedTopic.id)
    const completedRefreshes = new Set<string>()
    const jobs = await captureAddedPublicationEffectsForScope(post.id, () =>
      adminRemoveItemFromStory(storyPostUser.id, itemIds[0]!, {
        refreshStoryPostForStory: async (storyId, refreshOptions, refreshBehavior) => {
          expect(refreshBehavior?.enqueueAgent).toBe(false)
          if (!refreshOptions?.query) throw new Error('Expected transactional story refresh')
          const result = await refreshStoryPostForStory(storyId, refreshOptions, refreshBehavior)
          completedRefreshes.add(storyId)
          return result
        },
        invalidateStories: async (...storyIds) => {
          expect(completedRefreshes).toEqual(new Set([story.id]))
          await invalidateStories(...storyIds)
        },
      }),
    )
    await drainStoryPostRelatedUrlProjection(post.id)
    await expect(getPostRelatedUrlIds(post.id)).resolves.not.toContain(removedUrlId)
    await expect(getPostRelatedUrlIds(post.id)).resolves.toContain(retainedUrlId)
    expect(jobs.flatMap(job => job.keys)).toContainEqual({
      kind: 'impact_topic',
      uuidValue: removedTopic.id,
    })
  })
})
