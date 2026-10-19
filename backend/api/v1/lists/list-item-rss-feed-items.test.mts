import { describe, expect, it } from 'vitest'
import {
  createRandomString,
  createTestRssFeedItemWithUrl,
  createTestUser,
  disableTestRssFeed,
  insertTestRssFeed,
  insertTestTopic,
  softDeleteRssFeedItemsForTest,
} from '@voucha/test-helpers'
import { createRequest } from '@voucha/test-helpers/api/server'
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

describe('POST /api/v1/lists/:id/items/rss-feed-items availability', () => {
  it('returns 404 for a deleted item', async () => {
    const user = await createTestUser()
    const { itemId } = await createFeedItem(user.id)
    await softDeleteRssFeedItemsForTest([itemId])
    const { sent } = await addRssItem(user, itemId)
    await sent.expect(404)
  })

  it('returns 404 when the item feed is disabled', async () => {
    const user = await createTestUser()
    const { feedId, itemId } = await createFeedItem(user.id)
    await disableTestRssFeed(feedId)
    const { sent } = await addRssItem(user, itemId)
    await sent.expect(404)
  })
})

async function createFeedItem(userId: string) {
  const topicId = await insertTestTopic({
    name: `RFI vis ${createRandomString(8)}`,
    slug: `rfi-vis-${createRandomString(8)}`,
    createdById: userId,
  })
  const feedId = await insertTestRssFeed({
    topicId,
    title: `RFI vis feed ${createRandomString(8)}`,
  })
  const item = await createTestRssFeedItemWithUrl(feedId)
  return { feedId, itemId: item.id }
}

async function addRssItem(user: Awaited<ReturnType<typeof createTestUser>>, itemId: string) {
  const request = createRequest()
  await request.authenticateAs(user)
  const created = await request
    .post('/api/v1/lists')
    .set('Content-Type', 'application/json')
    .send({ name: `RFI vis ${createRandomString(8)}` })
  return {
    sent: request
      .post(`/api/v1/lists/${created.body.list.id}/items/rss-feed-items`)
      .set('Content-Type', 'application/json')
      .send({ rss_feed_item_id: itemId }),
  }
}

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
