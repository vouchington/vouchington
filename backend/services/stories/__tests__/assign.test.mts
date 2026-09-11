import { createHash } from 'node:crypto'
import { describe, it, expect, beforeAll } from 'vitest'
import { adminAssignItemToStory, adminRemoveItemFromStory } from '../assign.mts'
import { getStoryItemIds } from '../get.mts'
import {
  insertTestRssFeedItem,
  insertTestStory,
  createTestUrlWithHostname,
  createTestUserDirect,
  setTestItemStoryId,
} from '@voucha/test-helpers'
import { createTestRssFeed } from '@services/rss-feeds/test-fixtures'
import { createStoryPost } from '../story-posts.mts'
import { upsertSystemAdministrator } from '@services/users/system-users'
import type { PrivateUser } from '@services/users/types'

function sha256(data: unknown): Buffer {
  return createHash('sha256').update(JSON.stringify(data)).digest()
}

describe('adminAssignItemToStory', () => {
  let feedId: string
  let storyPostUser: PrivateUser
  let urlId: string

  beforeAll(async () => {
    const [feed, testUrlId] = await Promise.all([
      createTestRssFeed({}),
      createTestUrlWithHostname(),
    ])
    feedId = feed.id
    urlId = testUrlId
    await upsertSystemAdministrator('story-teller')
    storyPostUser = await createTestUserDirect()
  })

  async function makeItem() {
    const random = Math.random().toString(36).slice(2, 10)
    const itemData = { title: `Assign Test Item ${random}`, link: `https://example.com/${random}` }
    return insertTestRssFeedItem({
      rssFeedId: feedId,
      urlId,
      guid: `assign-test-${random}`,
      itemData,
      contentSha256: sha256(itemData),
    })
  }

  it('assigns an item to a story and returns the item id', async () => {
    const story = await insertTestStory({ title: 'Assign Target Story' })
    const itemId = await makeItem()
    const result = await adminAssignItemToStory(story.id, itemId)
    expect(result).toBe(itemId)
  })

  it('reports post-commit relation delivery failures and continues assignment delivery', async () => {
    const story = await insertTestStory({ title: 'Assignment delivery failure' })
    const storyItemIds = await Promise.all([makeItem(), makeItem()])
    await Promise.all(storyItemIds.map(itemId => setTestItemStoryId(itemId, story.id)))
    const { post } = await createStoryPost(story.id, storyPostUser)
    const itemId = await makeItem()
    const dispatchError = new Error('relation dispatch failed')
    const reportedErrors: Error[] = []
    const effects: string[] = []

    await expect(
      adminAssignItemToStory(story.id, itemId, {
        refreshStoryPostForStory: async (_storyId, refreshOptions, refreshBehavior) => {
          expect(refreshOptions?.query).toBeDefined()
          expect(refreshBehavior?.enqueueAgent).toBe(false)
          return {
            postId: post.id,
            impactedTopicIds: [],
            dispatchPostCommitEffects: async () => {
              throw dispatchError
            },
          }
        },
        enqueueStoryPostAgent: async postId => {
          effects.push(`agent:${postId}`)
        },
        invalidateStories: async (...storyIds) => {
          effects.push(`invalidate:${storyIds.filter(Boolean).join(',')}`)
        },
        onError: error => {
          reportedErrors.push(error)
        },
      }),
    ).resolves.toBe(itemId)

    await expect(getStoryItemIds(story.id)).resolves.toContain(itemId)
    expect(reportedErrors).toEqual([dispatchError])
    expect(effects).toEqual([`agent:${post.id}`, `invalidate:${story.id}`])
  })

  it('returns null when item does not exist', async () => {
    const story = await insertTestStory({ title: 'Non-existent Item Story' })
    const result = await adminAssignItemToStory(story.id, '018f7e1a-2b3c-7d4e-8f5a-9b0c1d2e3f4a')
    expect(result).toBeNull()
  })
})

describe('adminRemoveItemFromStory', () => {
  let feedId: string
  let urlId: string

  beforeAll(async () => {
    const [feed, testUrlId] = await Promise.all([
      createTestRssFeed({}),
      createTestUrlWithHostname(),
    ])
    feedId = feed.id
    urlId = testUrlId
  })

  async function makeItem() {
    const random = Math.random().toString(36).slice(2, 10)
    const itemData = { title: `Remove Test Item ${random}`, link: `https://example.com/${random}` }
    return insertTestRssFeedItem({
      rssFeedId: feedId,
      urlId,
      guid: `remove-test-${random}`,
      itemData,
      contentSha256: sha256(itemData),
    })
  }

  it('removes an item from its story and returns the item id', async () => {
    const story = await insertTestStory({ title: 'Remove Target Story' })
    const itemId = await makeItem()
    await adminAssignItemToStory(story.id, itemId)
    const result = await adminRemoveItemFromStory(itemId)
    expect(result).toBe(itemId)
  })

  it('returns null when item does not exist', async () => {
    const result = await adminRemoveItemFromStory('018f7e1a-2b3c-7d4e-8f5a-9b0c1d2e3f4b')
    expect(result).toBeNull()
  })
})
