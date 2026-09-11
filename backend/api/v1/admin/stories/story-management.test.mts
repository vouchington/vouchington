import { describe, it, expect, beforeAll } from 'vitest'
import { createRequest } from '@voucha/api/test-helpers/server'
import {
  createTestUser,
  insertTestStory,
  insertTestRssFeedItem,
  createTestUrlWithHostname,
  setTestItemStoryId,
} from '@voucha/test-helpers'
import { createTestRssFeed } from '@services/rss-feeds/test-fixtures'
import type { PrivateUser } from '@services/users/types'
import { createHash } from 'node:crypto'

describe('story-management', () => {
  let admin: PrivateUser
  let regularUser: PrivateUser

  beforeAll(async () => {
    ;[admin, regularUser] = await Promise.all([
      createTestUser({ administrator: true }),
      createTestUser(),
    ])
  })

  function sha256(data: unknown): Buffer {
    return createHash('sha256').update(JSON.stringify(data)).digest()
  }

  async function makeItem(): Promise<string> {
    const feed = await createTestRssFeed({})
    const urlId = await createTestUrlWithHostname()
    const random = Math.random().toString(36).slice(2, 10)
    const itemData = { title: `Item ${random}`, link: `https://example.com/${random}` }
    return insertTestRssFeedItem({
      rssFeedId: feed.id,
      urlId,
      guid: `admin-story-test-${random}`,
      itemData,
      contentSha256: sha256(itemData),
    })
  }

  describe('PUT /api/v1/stories/:storyId/items/:itemId', () => {
    it('returns 401 when not authenticated', async () => {
      const story = await insertTestStory()
      const itemId = await makeItem()
      const request = createRequest()
      await request.put(`/api/v1/stories/${story.id}/items/${itemId}`).expect(401)
    })

    it('returns 403 for non-admin users', async () => {
      const story = await insertTestStory()
      const itemId = await makeItem()
      const request = createRequest()
      await request.authenticateAs(regularUser)
      await request.put(`/api/v1/stories/${story.id}/items/${itemId}`).expect(403)
    })

    it('returns 404 for unknown story', async () => {
      const itemId = await makeItem()
      const request = createRequest()
      await request.authenticateAs(admin)
      await request
        .put(`/api/v1/stories/00000000-0000-0000-0000-000000000001/items/${itemId}`)
        .expect(404)
    })

    it('assigns item to story for admin', async () => {
      const story = await insertTestStory()
      const itemId = await makeItem()
      const request = createRequest()
      await request.authenticateAs(admin)
      await request.put(`/api/v1/stories/${story.id}/items/${itemId}`).expect(204)
    })
  })

  describe('DELETE /api/v1/stories/:storyId/items/:itemId', () => {
    it('returns 401 when not authenticated', async () => {
      const story = await insertTestStory()
      const itemId = await makeItem()
      const request = createRequest()
      await request.delete(`/api/v1/stories/${story.id}/items/${itemId}`).expect(401)
    })

    it('returns 403 for non-admin users', async () => {
      const story = await insertTestStory()
      const itemId = await makeItem()
      const request = createRequest()
      await request.authenticateAs(regularUser)
      await request.delete(`/api/v1/stories/${story.id}/items/${itemId}`).expect(403)
    })

    it('removes item from story for admin', async () => {
      const story = await insertTestStory()
      const itemId = await makeItem()
      await setTestItemStoryId(itemId, story.id)
      const request = createRequest()
      await request.authenticateAs(admin)
      await request.delete(`/api/v1/stories/${story.id}/items/${itemId}`).expect(204)
    })
  })

  describe('PUT /api/v1/stories/:storyId/official', () => {
    it('returns 401 when not authenticated', async () => {
      const story = await insertTestStory()
      const request = createRequest()
      await request.put(`/api/v1/stories/${story.id}/official`).expect(401)
    })

    it('returns 403 for non-admin users', async () => {
      const story = await insertTestStory()
      const itemId = await makeItem()
      const request = createRequest()
      await request.authenticateAs(regularUser)
      await request
        .put(`/api/v1/stories/${story.id}/official`)
        .send({ rss_feed_item_id: itemId })
        .expect(403)
    })

    it('sets official item for admin', async () => {
      const story = await insertTestStory()
      const itemId = await makeItem()
      await setTestItemStoryId(itemId, story.id)
      const request = createRequest()
      await request.authenticateAs(admin)
      const response = await request
        .put(`/api/v1/stories/${story.id}/official`)
        .send({ rss_feed_item_id: itemId })
        .expect(200)
      expect(response.body.story.official_rss_feed_item_id).toBe(itemId)
      expect(response.body.story.official_locked_at).toBeDefined()
    })

    it('returns 400 for invalid rss_feed_item_id', async () => {
      const story = await insertTestStory()
      const request = createRequest()
      await request.authenticateAs(admin)
      await request
        .put(`/api/v1/stories/${story.id}/official`)
        .send({ rss_feed_item_id: 'not-a-uuid' })
        .expect(400)
    })
  })

  describe('PATCH /api/v1/stories/:storyId', () => {
    it('returns 401 when not authenticated', async () => {
      const story = await insertTestStory()
      const request = createRequest()
      await request.patch(`/api/v1/stories/${story.id}`).expect(401)
    })

    it('returns 403 for non-admin users', async () => {
      const story = await insertTestStory()
      const request = createRequest()
      await request.authenticateAs(regularUser)
      await request.patch(`/api/v1/stories/${story.id}`).send({ title: 'New Title' }).expect(403)
    })

    it('updates story title for admin', async () => {
      const story = await insertTestStory({ title: 'Old Title' })
      const request = createRequest()
      await request.authenticateAs(admin)
      const response = await request
        .patch(`/api/v1/stories/${story.id}`)
        .send({ title: 'New Title' })
        .expect(200)
      expect(response.body.story.title).toBe('New Title')
    })

    it('returns 400 for empty title', async () => {
      const story = await insertTestStory()
      const request = createRequest()
      await request.authenticateAs(admin)
      await request.patch(`/api/v1/stories/${story.id}`).send({ title: '' }).expect(400)
    })

    it('returns 404 for unknown story', async () => {
      const request = createRequest()
      await request.authenticateAs(admin)
      await request
        .patch('/api/v1/stories/00000000-0000-0000-0000-000000000001')
        .send({ title: 'Title' })
        .expect(404)
    })
  })
})
