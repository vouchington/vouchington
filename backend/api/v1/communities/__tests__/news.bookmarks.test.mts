import { describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  createTestUser,
  createTestTopic,
  createTestRssFeedWithTiming,
  createTestRssFeedItemWithUrl,
  insertTestCommunity,
  insertTestCommunityListItem,
} from '@voucha/test-helpers'
import { bookmarkEntity } from '@services/bookmarks/upsert'

describe('community news bookmarks', () => {
  it('returns authenticated item bookmarks while omitting them for anonymous readers', async () => {
    const user = await createTestUser()
    const topic = await createTestTopic({ user })
    const feedId = await createTestRssFeedWithTiming(topic.id)
    const item = await createTestRssFeedItemWithUrl(feedId)
    const community = await insertTestCommunity({ createdById: user.id, visibility: 'public' })
    await insertTestCommunityListItem({
      communityId: community.id,
      itemType: 'rss_feed',
      entityId: feedId,
    })
    await bookmarkEntity(user, 'rss_feed_item', { id: item.id }, 'save')

    const path = `/api/v1/communities/${community.slug}/news`
    const anonymous = await createRequest().get(path).expect(200)
    expect(anonymous.body.rss_feed_items[item.id]).toBeDefined()
    expect(anonymous.body).not.toHaveProperty('bookmarks')

    const request = createRequest()
    await request.authenticateAs(user)
    const authenticated = await request.get(path).expect(200)
    expect(authenticated.body.results).toEqual(
      expect.arrayContaining([expect.objectContaining({ entity_id: item.id })]),
    )
    expect(authenticated.body.bookmarks?.[item.id]).toMatchObject({ save: true })
  })
})
