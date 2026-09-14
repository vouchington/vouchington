import { describe, it, expect, beforeAll } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  createTestUser,
  createRandomString,
  insertTestTopic,
  insertTestRssFeed,
  createTestRssFeedItemWithUrl,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'

describe('POST /api/v1/lists/:id/items/rss-feed-items', () => {
  let user: PrivateUser
  let listId: string
  let rssFeedItemId: string

  beforeAll(async () => {
    user = await createTestUser()
    const topicId = await insertTestTopic({
      name: `RFI Topic ${createRandomString(8)}`,
      slug: `rfi-topic-${createRandomString(8)}`,
      createdById: user.id,
    })
    const feedId = await insertTestRssFeed({ topicId, title: `RFI Feed ${createRandomString(8)}` })
    const item = await createTestRssFeedItemWithUrl(feedId)
    rssFeedItemId = item.id

    const request = createRequest()
    await request.authenticateAs(user)
    const r = await request
      .post('/api/v1/lists')
      .set('Content-Type', 'application/json')
      .send({ name: `RFI List ${createRandomString(8)}` })
    listId = r.body.list.id
  })

  it('returns 401 without auth', async () => {
    const request = createRequest()
    await request
      .post(`/api/v1/lists/${listId}/items/rss-feed-items`)
      .set('Content-Type', 'application/json')
      .send({ rss_feed_item_id: rssFeedItemId })
      .expect(401)
  })

  it('adds an rss feed item to the list', async () => {
    const request = createRequest()
    await request.authenticateAs(user)
    const response = await request
      .post(`/api/v1/lists/${listId}/items/rss-feed-items`)
      .set('Content-Type', 'application/json')
      .send({ rss_feed_item_id: rssFeedItemId })
      .expect(201)
    expect(response.body.list_item.entity_id).toBe(rssFeedItemId)
    expect(response.body.list_item.item_type).toBe('rss_feed_item')
  })

  it('is idempotent on duplicate add', async () => {
    const request = createRequest()
    await request.authenticateAs(user)
    await request
      .post(`/api/v1/lists/${listId}/items/rss-feed-items`)
      .set('Content-Type', 'application/json')
      .send({ rss_feed_item_id: rssFeedItemId })
      .expect(201)
  })

  it('returns 403 for non-owner', async () => {
    const other = await createTestUser()
    const request = createRequest()
    await request.authenticateAs(other)
    await request
      .post(`/api/v1/lists/${listId}/items/rss-feed-items`)
      .set('Content-Type', 'application/json')
      .send({ rss_feed_item_id: rssFeedItemId })
      .expect(403)
  })

  it('returns 422 when rss_feed_item_id is missing', async () => {
    const request = createRequest()
    await request.authenticateAs(user)
    await request
      .post(`/api/v1/lists/${listId}/items/rss-feed-items`)
      .set('Content-Type', 'application/json')
      .send({})
      .expect(422)
  })

  it('returns 404 when rss_feed_item_id does not exist', async () => {
    const request = createRequest()
    await request.authenticateAs(user)
    await request
      .post(`/api/v1/lists/${listId}/items/rss-feed-items`)
      .set('Content-Type', 'application/json')
      .send({ rss_feed_item_id: '00000000-0000-7000-8000-000000000000' })
      .expect(404)
  })

  it('returns 422 when rss_feed_item_id is not a valid UUID', async () => {
    const request = createRequest()
    await request.authenticateAs(user)
    await request
      .post(`/api/v1/lists/${listId}/items/rss-feed-items`)
      .set('Content-Type', 'application/json')
      .send({ rss_feed_item_id: 'not-a-uuid' })
      .expect(422)
  })
})

describe('DELETE /api/v1/lists/:id/items/rss-feed-items/:entityId', () => {
  let user: PrivateUser
  let listId: string
  let rssFeedItemId: string

  beforeAll(async () => {
    user = await createTestUser()
    const topicId = await insertTestTopic({
      name: `RFI Del Topic ${createRandomString(8)}`,
      slug: `rfi-del-topic-${createRandomString(8)}`,
      createdById: user.id,
    })
    const feedId = await insertTestRssFeed({
      topicId,
      title: `RFI Del Feed ${createRandomString(8)}`,
    })
    const item = await createTestRssFeedItemWithUrl(feedId)
    rssFeedItemId = item.id

    const request = createRequest()
    await request.authenticateAs(user)
    const r = await request
      .post('/api/v1/lists')
      .set('Content-Type', 'application/json')
      .send({ name: `RFI Del List ${createRandomString(8)}` })
    listId = r.body.list.id
    await request
      .post(`/api/v1/lists/${listId}/items/rss-feed-items`)
      .set('Content-Type', 'application/json')
      .send({ rss_feed_item_id: rssFeedItemId })
  })

  it('returns 401 without auth', async () => {
    const request = createRequest()
    await request
      .delete(`/api/v1/lists/${listId}/items/rss-feed-items/${rssFeedItemId}`)
      .expect(401)
  })

  it('returns 403 for non-owner', async () => {
    const other = await createTestUser()
    const request = createRequest()
    await request.authenticateAs(other)
    await request
      .delete(`/api/v1/lists/${listId}/items/rss-feed-items/${rssFeedItemId}`)
      .expect(403)
  })

  it('removes an rss feed item from the list', async () => {
    const request = createRequest()
    await request.authenticateAs(user)
    await request
      .delete(`/api/v1/lists/${listId}/items/rss-feed-items/${rssFeedItemId}`)
      .expect(204)
  })

  it('returns 422 for invalid UUID entityId', async () => {
    const request = createRequest()
    await request.authenticateAs(user)
    await request.delete(`/api/v1/lists/${listId}/items/rss-feed-items/not-a-uuid`).expect(422)
  })
})
