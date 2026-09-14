import { describe, it, beforeAll } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  createTestUser,
  createRandomString,
  insertTestTopic,
  insertTestRssFeed,
  createTestRssFeedItemWithUrl,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'

describe('PUT /api/v1/rss-feed-items/:id/read', () => {
  let user: PrivateUser
  let rssFeedItemId: string

  beforeAll(async () => {
    user = await createTestUser()
    const topicId = await insertTestTopic({
      name: `Read PUT Topic ${createRandomString(8)}`,
      slug: `read-put-topic-${createRandomString(8)}`,
      createdById: user.id,
    })
    const feedId = await insertTestRssFeed({
      topicId,
      title: `Read PUT Feed ${createRandomString(8)}`,
    })
    const item = await createTestRssFeedItemWithUrl(feedId)
    rssFeedItemId = item.id
  })

  it('returns 401 without auth', async () => {
    const request = createRequest()
    await request.put(`/api/v1/rss-feed-items/${rssFeedItemId}/read`).expect(401)
  })

  it('marks an rss_feed_item as read (204)', async () => {
    const request = createRequest()
    await request.authenticateAs(user)
    await request.put(`/api/v1/rss-feed-items/${rssFeedItemId}/read`).expect(204)
  })

  it('is idempotent', async () => {
    const request = createRequest()
    await request.authenticateAs(user)
    await request.put(`/api/v1/rss-feed-items/${rssFeedItemId}/read`).expect(204)
  })

  it('returns 422 for invalid UUID', async () => {
    const request = createRequest()
    await request.authenticateAs(user)
    await request.put('/api/v1/rss-feed-items/not-a-uuid/read').expect(422)
  })
})

describe('DELETE /api/v1/rss-feed-items/:id/read', () => {
  let user: PrivateUser
  let rssFeedItemId: string

  beforeAll(async () => {
    user = await createTestUser()
    const topicId = await insertTestTopic({
      name: `Read DEL Topic ${createRandomString(8)}`,
      slug: `read-del-topic-${createRandomString(8)}`,
      createdById: user.id,
    })
    const feedId = await insertTestRssFeed({
      topicId,
      title: `Read DEL Feed ${createRandomString(8)}`,
    })
    const item = await createTestRssFeedItemWithUrl(feedId)
    rssFeedItemId = item.id
  })

  it('returns 401 without auth', async () => {
    const request = createRequest()
    await request.delete(`/api/v1/rss-feed-items/${rssFeedItemId}/read`).expect(401)
  })

  it('marks an rss_feed_item as unread (204)', async () => {
    const request = createRequest()
    await request.authenticateAs(user)
    // First mark read
    await request.put(`/api/v1/rss-feed-items/${rssFeedItemId}/read`).expect(204)
    // Then unread
    await request.delete(`/api/v1/rss-feed-items/${rssFeedItemId}/read`).expect(204)
  })

  it('is a no-op when item is not read', async () => {
    const request = createRequest()
    await request.authenticateAs(user)
    await request.delete(`/api/v1/rss-feed-items/${rssFeedItemId}/read`).expect(204)
  })

  it('returns 422 for invalid UUID', async () => {
    const request = createRequest()
    await request.authenticateAs(user)
    await request.delete('/api/v1/rss-feed-items/not-a-uuid/read').expect(422)
  })
})
