import { createHash } from 'node:crypto'
import { afterEach, describe, it, expect, beforeAll, vi } from 'vitest'
import { adminAssignItemToStory, adminRemoveItemFromStory } from '../assign.mts'
import { getStoryItemIds } from '../get.mts'
import {
  insertTestRssFeedItem,
  insertTestStory,
  createTestUrlWithHostname,
  createTestUserDirect,
  setTestItemStoryId,
} from '@voucha/test-helpers'
import { createTestRssFeed } from '@voucha/test-helpers/rss-feed-create'
import { prepareStoryPost } from '../story-posts.mts'
import * as notificationReconcile from '@services/entity-relations/notification-reconcile'
import * as cacheInvalidation from '../cache-invalidation.mts'
import { trackAgentQueueAdds } from '../../../test-helpers/services/stories/story-post-agent-adds.mts'
import { sentryCaptureExceptionMock } from '../../../test-helpers/vitest.setup.sentry-mock.mts'
import { upsertSystemUser } from '@services/users/system-users'
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
    await upsertSystemUser('story-teller')
    storyPostUser = await createTestUserDirect()
  })

  afterEach(() => {
    vi.restoreAllMocks()
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

  it('reports post-commit relation delivery failures and continues assignment delivery', async () => {
    const story = await insertTestStory({ title: 'Assignment delivery failure' })
    const storyItemIds = await Promise.all([makeItem(), makeItem()])
    await Promise.all(storyItemIds.map(itemId => setTestItemStoryId(itemId, story.id)))
    const prepared = await prepareStoryPost(story.id, storyPostUser)
    await prepared.finalize()
    const { post } = prepared.response
    const itemId = await makeItem()
    const dispatchError = new Error('relation dispatch failed')
    vi.spyOn(notificationReconcile, 'enqueueNotificationReconcileForRelations').mockRejectedValue(
      dispatchError,
    )
    const invalidateSpy = vi.spyOn(cacheInvalidation, 'invalidateStories')
    const agent = trackAgentQueueAdds()

    await expect(
      adminAssignItemToStory((await createTestUserDirect()).id, story.id, itemId),
    ).resolves.toBe(itemId)
    await Promise.all(agent.admissions)

    await expect(getStoryItemIds(story.id)).resolves.toContain(itemId)
    expect(
      sentryCaptureExceptionMock.mock.calls.filter(([captured]) => captured === dispatchError),
    ).toHaveLength(1)
    expect(
      agent.calls.filter(call => {
        const data = call.data as { post_id?: string; force?: boolean } | undefined
        // Post creation may enqueue its own unforced run for this post; only the forced one is the assignment's.
        return data?.post_id === post.id && data.force === true
      }),
    ).toEqual([{ name: 'story-post', data: { post_id: post.id, force: true } }])
    expect(invalidateSpy).toHaveBeenCalledWith(story.id, null)
  })

  it('returns null when item does not exist', async () => {
    const story = await insertTestStory({ title: 'Non-existent Item Story' })
    const result = await adminAssignItemToStory(
      (await createTestUserDirect()).id,
      story.id,
      '018f7e1a-2b3c-7d4e-8f5a-9b0c1d2e3f4a',
    )
    expect(result).toBeNull()
  })
})

describe('adminRemoveItemFromStory', () => {
  it('returns null when item does not exist', async () => {
    const result = await adminRemoveItemFromStory(
      (await createTestUserDirect()).id,
      '018f7e1a-2b3c-7d4e-8f5a-9b0c1d2e3f4b',
    )
    expect(result).toBeNull()
  })
})
