import { describe, expect, it } from 'vitest'
import {
  createRandomString,
  createTestRssFeedItemWithUrl,
  insertTestRssFeed,
  insertTestTopic,
} from '@voucha/test-helpers'
import { registerUserListItemRouteTests } from '@voucha/test-helpers/user-list-item-routes'

async function createRssFeedItemId(
  userId: string,
  names: { topic: string; slug: string; feed: string },
): Promise<string> {
  const topicId = await insertTestTopic({
    name: `${names.topic} ${createRandomString(8)}`,
    slug: `${names.slug}-${createRandomString(8)}`,
    createdById: userId,
  })
  const feedId = await insertTestRssFeed({
    topicId,
    title: `${names.feed} ${createRandomString(8)}`,
  })
  const item = await createTestRssFeedItemWithUrl(feedId)
  return item.id
}

describe('POST /api/v1/lists/:id/items/rss-feed-items', () => {
  const routes = registerUserListItemRouteTests({
    mode: 'add',
    segment: 'rss-feed-items',
    bodyKey: 'rss_feed_item_id',
    listNamePrefix: 'RFI List',
    createEntityId: userId =>
      createRssFeedItemId(userId, {
        topic: 'RFI Topic',
        slug: 'rfi-topic',
        feed: 'RFI Feed',
      }),
  })

  it('adds an rss feed item to the list', async () => {
    const { sent } = await routes.authorizedPost()
    const response = await sent.expect(201)
    expect(response.body.list_item.entity_id).toBe(routes.entityId())
    expect(response.body.list_item.item_type).toBe('rss_feed_item')
  })
})

describe('DELETE /api/v1/lists/:id/items/rss-feed-items/:entityId', () => {
  registerUserListItemRouteTests({
    mode: 'remove',
    segment: 'rss-feed-items',
    bodyKey: 'rss_feed_item_id',
    listNamePrefix: 'RFI Del List',
    createEntityId: userId =>
      createRssFeedItemId(userId, {
        topic: 'RFI Del Topic',
        slug: 'rfi-del-topic',
        feed: 'RFI Del Feed',
      }),
  })
})
